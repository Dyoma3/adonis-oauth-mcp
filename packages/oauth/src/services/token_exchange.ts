import { createHash, timingSafeEqual } from 'node:crypto'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import OAuthAuthorizationCode from '../models/authorization_code.js'
import OAuthResponder from '../responder.js'
import OAuthServer from '../oauth_server.js'
import { tokenRequestValidator } from '../validators.js'
import type { TokenRequestPayload } from '../validators.js'

/**
 * Exchanges an authorization code for an access token.
 *
 * Everything the specification requires happens here: the code is consumed
 * exactly once, the PKCE verifier is checked, and the client, redirect URI
 * and resource must match the ones the code was issued for. Which token to
 * hand back is the one decision left to the application, through the
 * resource's `issueToken`.
 */
@inject()
export default class OAuthTokenExchange {
  constructor(
    private ctx: HttpContext,
    private server: OAuthServer
  ) {}

  async execute() {
    const responder = new OAuthResponder(this.ctx)
    this.disableCaching()

    const payload = this.parsePayload()
    if (!payload) return responder.invalidRequest()

    const authorizationCode = await OAuthAuthorizationCode.consume(payload.code)
    if (!authorizationCode) return responder.invalidGrant()

    const resource = this.server.getResource(authorizationCode.resource)
    if (!resource) return responder.invalidGrant()

    const client = this.server.getClient(resource, payload.client_id)
    if (!client) return responder.invalidClient()

    if (payload.client_id !== authorizationCode.clientId) return responder.invalidGrant()
    if (payload.redirect_uri !== authorizationCode.redirectUri) return responder.invalidGrant()
    if (payload.resource !== authorizationCode.resource) return responder.invalidGrant()
    if (authorizationCode.codeChallengeMethod !== 'S256') return responder.invalidGrant()
    if (!this.isValidPkceVerifier(payload, authorizationCode.codeChallenge)) {
      return responder.invalidGrant()
    }

    const token = await resource.issueToken({
      userId: authorizationCode.userId,
      scopes: authorizationCode.scopes,
      client,
      resource,
      ctx: this.ctx,
    })

    if (!token) return responder.invalidGrant()

    return this.ctx.response.ok({
      access_token: token.accessToken,
      token_type: token.tokenType ?? 'Bearer',
      ...(token.expiresIn === undefined ? {} : { expires_in: token.expiresIn }),
      scope: token.scope ?? authorizationCode.scopes.join(' '),
    })
  }

  /**
   * Token responses carry credentials, so they must never be cached.
   */
  private disableCaching() {
    this.ctx.response.header('Cache-Control', 'no-store')
    this.ctx.response.header('Pragma', 'no-cache')
  }

  private parsePayload() {
    const parsed = tokenRequestValidator.safeParse(this.ctx.request.body())
    return parsed.success ? parsed.data : null
  }

  private isValidPkceVerifier(payload: TokenRequestPayload, codeChallenge: string) {
    const computedChallenge = createHash('sha256').update(payload.code_verifier).digest('base64url')

    return this.safeEqual(computedChallenge, codeChallenge)
  }

  private safeEqual(value: string, expectedValue: string) {
    const valueBuffer = Buffer.from(value)
    const expectedValueBuffer = Buffer.from(expectedValue)

    if (valueBuffer.length !== expectedValueBuffer.length) return false
    return timingSafeEqual(valueBuffer, expectedValueBuffer)
  }
}
