/**
 * The responder only needs the pieces of ctx.response it calls, so a recording
 * double is enough to pin down what each endpoint answers.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import OAuthResponder from '../build/src/responder.js'

function fakeContext() {
  const calls = []
  const record = (method) => (body) => {
    calls.push({ method, body })
    return calls.at(-1)
  }

  return {
    calls,
    response: {
      ok: record('ok'),
      redirect: record('redirect'),
      badRequest: record('badRequest'),
      unauthorized: record('unauthorized'),
      header: () => {},
    },
  }
}

const payload = {
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  state: 'xyz',
}

test('answers the redirect as JSON by default', () => {
  const ctx = fakeContext()

  new OAuthResponder(ctx).redirectWithAuthorizationCode(payload, 'the-code')

  assert.deepEqual(ctx.calls, [
    {
      method: 'ok',
      body: {
        redirect_to: 'https://claude.ai/api/mcp/auth_callback?code=the-code&state=xyz',
      },
    },
  ])
})

test('answers a 302 in http mode', () => {
  const ctx = fakeContext()

  new OAuthResponder(ctx, 'http').redirectWithAuthorizationCode(payload, 'the-code')

  assert.deepEqual(ctx.calls, [
    {
      method: 'redirect',
      body: 'https://claude.ai/api/mcp/auth_callback?code=the-code&state=xyz',
    },
  ])
})

test('carries the error and the state back to the client', () => {
  const ctx = fakeContext()

  new OAuthResponder(ctx, 'http').redirectWithError(payload, 'access_denied')

  assert.equal(
    ctx.calls[0].body,
    'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=xyz'
  )
})

test('omits a state that was never sent', () => {
  const ctx = fakeContext()

  new OAuthResponder(ctx, 'http').redirectWithError({ ...payload, state: undefined }, 'access_denied')

  assert.equal(ctx.calls[0].body, 'https://claude.ai/api/mcp/auth_callback?error=access_denied')
})

test('maps every reason an authorization request failed to its response', () => {
  const responseFor = (kind) => {
    const ctx = fakeContext()
    new OAuthResponder(ctx).authorizationError(kind)
    return ctx.calls[0]
  }

  assert.deepEqual(responseFor('invalid_target'), {
    method: 'badRequest',
    body: { error: 'invalid_target', error_description: 'Unsupported OAuth resource' },
  })

  assert.deepEqual(responseFor('invalid_client'), {
    method: 'badRequest',
    body: { error: 'invalid_client' },
  })

  assert.deepEqual(responseFor('invalid_redirect_uri'), {
    method: 'badRequest',
    body: { error: 'invalid_request', error_description: 'Invalid redirect_uri' },
  })
})
