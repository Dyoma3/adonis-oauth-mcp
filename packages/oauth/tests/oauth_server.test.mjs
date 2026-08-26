/**
 * Runs against the built package: npm run build && npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import OAuthServer from '../build/src/oauth_server.js'

const resource = {
  id: 'mcp',
  resource: 'https://app.test/mcp',
  resourceName: 'Test MCP',
  scopes: ['mcp:read', 'mcp:write'],
  clients: [
    {
      id: 'claude',
      name: 'Claude',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      allowedScopes: ['mcp:read', 'mcp:write'],
    },
    {
      id: 'claude-code',
      redirectUris: ['http://localhost/callback'],
      allowedScopes: ['mcp:read'],
    },
  ],
  issueToken: () => ({ accessToken: 'token' }),
}

const server = new OAuthServer({
  issuer: 'https://app.test',
  authorizationEndpoint: 'https://app.test/oauth/authorize',
  tokenEndpoint: 'https://app.test/oauth/token',
  resources: [resource],
})

const validQuery = {
  response_type: 'code',
  client_id: 'claude',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
  resource: 'https://app.test/mcp',
  state: 'xyz',
}

test('advertises the authorization server metadata', () => {
  assert.deepEqual(server.authorizationServerMetadata(), {
    issuer: 'https://app.test',
    authorization_endpoint: 'https://app.test/oauth/authorize',
    token_endpoint: 'https://app.test/oauth/token',
    token_endpoint_auth_methods_supported: ['none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:read', 'mcp:write'],
  })
})

test('advertises a protected resource by its slug', () => {
  assert.equal(server.protectedResourceMetadata('mcp').resource_name, 'Test MCP')
  assert.equal(server.protectedResourceMetadata('nope'), null)
})

test('defaults the authorization code lifetime to ten minutes', () => {
  assert.equal(server.authorizationCodeTtlSeconds, 600)
})

test('accepts a valid authorization request', () => {
  const validation = server.validateAuthorizationRequest(validQuery)

  assert.equal(validation.valid, true)
  assert.equal(validation.client.id, 'claude')
  assert.deepEqual(validation.scopes, ['mcp:read', 'mcp:write'])
  assert.equal(validation.fields.length, 7)
})

test('deduplicates the requested scopes', () => {
  const validation = server.validateAuthorizationRequest({
    ...validQuery,
    scope: 'mcp:read  mcp:read',
  })

  assert.deepEqual(validation.scopes, ['mcp:read'])
})

test('reports the missing parameters', () => {
  const validation = server.validateAuthorizationRequest({ client_id: 'claude' })

  assert.equal(validation.valid, false)
  assert.ok(validation.missingParams.includes('resource'))
})

test('rejects a challenge method other than S256', () => {
  const validation = server.validateAuthorizationRequest({
    ...validQuery,
    code_challenge_method: 'plain',
  })

  assert.deepEqual(validation.invalidParams, ['code_challenge_method'])
})

test('rejects an unknown client, resource or redirect URI', () => {
  assert.deepEqual(
    server.validateAuthorizationRequest({ ...validQuery, client_id: 'ghost' }).invalidParams,
    ['client_id']
  )

  assert.deepEqual(
    server.validateAuthorizationRequest({ ...validQuery, resource: 'https://app.test/other' })
      .invalidParams,
    ['resource']
  )

  assert.deepEqual(
    server.validateAuthorizationRequest({
      ...validQuery,
      redirect_uri: 'https://evil.test/callback',
    }).invalidParams,
    ['redirect_uri']
  )
})

test('ignores the port of a loopback redirect URI', () => {
  const validation = server.validateAuthorizationRequest({
    ...validQuery,
    client_id: 'claude-code',
    redirect_uri: 'http://localhost:53219/callback',
  })

  assert.equal(validation.valid, true)
  assert.deepEqual(validation.scopes, ['mcp:read'])
})
