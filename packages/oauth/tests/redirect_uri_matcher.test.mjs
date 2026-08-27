import { test } from 'node:test'
import assert from 'node:assert/strict'
import OAuthRedirectUriMatcher from '../build/src/redirect_uri_matcher.js'

const matches = (registered, redirectUri, patterns = []) =>
  new OAuthRedirectUriMatcher(
    { id: 'test', redirectUris: registered, redirectUriPatterns: patterns, allowedScopes: [] },
    redirectUri
  ).execute()

test('requires an exact match for anything that is not loopback', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback']

  assert.equal(matches(registered, 'https://claude.ai/api/mcp/auth_callback'), true)
  assert.equal(matches(registered, 'https://claude.ai/api/mcp/auth_callback/extra'), false)
  assert.equal(matches(registered, 'https://claude.ai/api/mcp/auth_callback?x=1'), false)
  assert.equal(matches(registered, 'https://evil.test/api/mcp/auth_callback'), false)
})

test('lets a loopback client pick any port', () => {
  const registered = ['http://127.0.0.1/callback']

  assert.equal(matches(registered, 'http://127.0.0.1/callback'), true)
  assert.equal(matches(registered, 'http://127.0.0.1:59137/callback'), true)
  assert.equal(matches(registered, 'http://localhost:59137/callback'), false, 'host must match')
})

test('treats the IPv6 loopback like the IPv4 one', () => {
  const registered = ['http://[::1]/callback']

  assert.equal(matches(registered, 'http://[::1]:59137/callback'), true)
  assert.equal(matches(registered, 'http://[::1]:59137/callback/--52FXdsbEbv'), true)
  assert.equal(matches(registered, 'http://[::1]:59137/callbackevil'), false)
})

/**
 * Deliberate extension: Codex appends a generated segment to its callback.
 * Only descendants of the registered path qualify, never a sibling.
 */
test('accepts a generated subpath under a loopback callback', () => {
  const registered = ['http://127.0.0.1/callback']

  assert.equal(matches(registered, 'http://127.0.0.1:59137/callback/--52FXdsbEbv'), true)
  assert.equal(matches(registered, 'http://127.0.0.1:59137/callbackevil/--52FXdsbEbv'), false)
})

test('honours a port the registration pinned', () => {
  const registered = ['http://127.0.0.1:8080/callback']

  assert.equal(matches(registered, 'http://127.0.0.1:8080/callback'), true)
  assert.equal(matches(registered, 'http://127.0.0.1:9090/callback'), false)
})

test('never widens a bare loopback origin', () => {
  assert.equal(matches(['http://127.0.0.1/'], 'http://127.0.0.1:59137/anything'), false)
})

/**
 * Deliberate extension: the ChatGPT connector carries an id in its path.
 */
test('matches one generated segment against a registered pattern', () => {
  const patterns = ['https://chatgpt.com/connector/oauth/:connectorId']

  assert.equal(matches([], 'https://chatgpt.com/connector/oauth/abc-123', patterns), true)
  assert.equal(matches([], 'https://chatgpt.com/connector/oauth/abc/123', patterns), false)
  assert.equal(matches([], 'https://chatgpt.com/connector/oauth/', patterns), false)
  assert.equal(matches([], 'https://evil.test/connector/oauth/abc-123', patterns), false)
})

test('refuses a pattern that is not https', () => {
  assert.equal(matches([], 'http://chatgpt.com/x/abc', ['http://chatgpt.com/x/:id']), false)
})
