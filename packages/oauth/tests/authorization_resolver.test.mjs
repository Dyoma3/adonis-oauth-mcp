/**
 * The resolver takes only the server, so it can be exercised without an
 * HttpContext.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import OAuthServer from '../build/src/oauth_server.js'
import OAuthAuthorizationResolver from '../build/src/authorization_resolver.js'

const server = new OAuthServer({
  issuer: 'https://app.test',
  authorizationEndpoint: 'https://app.test/oauth/authorize',
  tokenEndpoint: 'https://app.test/oauth/token',
  resources: [
    {
      id: 'mcp',
      resource: 'https://app.test/mcp',
      scopes: ['mcp:read'],
      clients: [
        {
          id: 'claude',
          redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
          allowedScopes: ['mcp:read'],
        },
      ],
      issueToken: () => ({ accessToken: 'token' }),
    },
  ],
})

const resolver = new OAuthAuthorizationResolver(server)

const payload = {
  response_type: 'code',
  client_id: 'claude',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
  resource: 'https://app.test/mcp',
}

test('parses a valid authorization request', () => {
  assert.deepEqual(resolver.parse(payload), payload)
})

test('rejects a body that is not an authorization request', () => {
  assert.equal(resolver.parse({ client_id: 'claude' }), null)
  assert.equal(resolver.parse(undefined), null)
})

test('resolves the resource and the client', () => {
  const resolution = resolver.resolve(payload)

  assert.equal(resolution.ok, true)
  assert.equal(resolution.resource.id, 'mcp')
  assert.equal(resolution.client.id, 'claude')
})

test('reports why it could not resolve the request', () => {
  assert.deepEqual(resolver.resolve({ ...payload, resource: 'https://app.test/other' }), {
    ok: false,
    error: 'invalid_target',
  })

  assert.deepEqual(resolver.resolve({ ...payload, client_id: 'ghost' }), {
    ok: false,
    error: 'invalid_client',
  })

  assert.deepEqual(resolver.resolve({ ...payload, redirect_uri: 'https://evil.test/callback' }), {
    ok: false,
    error: 'invalid_redirect_uri',
  })
})
