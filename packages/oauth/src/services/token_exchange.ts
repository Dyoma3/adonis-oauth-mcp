import { createHash, timingSafeEqual } from 'node:crypto'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import OAuthFlow from './flow.js'
import OAuthAuthorizationCode from '../models/authorization_code.js'
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
export default class OAuthTokenExchange extends OAuthFlow {
  constructor(ctx: HttpContext, server: OAuthServer) {
    super(ctx, server)
  }

  async execute() {
    this.disableCaching()

    const payload = this.getPayload()
    if (!payload) return this.invalidRequestResponse()

    const authorizationCode = await OAuthAuthorizationCode.consume(payload.code)
    if (!authorizationCode) return this.invalidGrantResponse()

    const resource = this.server.getResource(authorizationCode.resource)
    if (!resource) return this.invalidGrantResponse()

    const client = this.server.getClient(resource, payload.client_id)
    if (!client) return this.invalidClientResponse()

    if (payload.client_id !== authorizationCode.clientId) return this.invalidGrantResponse()
    if (payload.redirect_uri !== authorizationCode.redirectUri) return this.invalidGrantResponse()
    if (payload.resource !== authorizationCode.resource) return this.invalidGrantResponse()
    if (authorizationCode.codeChallengeMethod !== 'S256') return this.invalidGrantResponse()
    if (!this.isValidPkceVerifier(payload, authorizationCode.codeChallenge)) {
      return this.invalidGrantResponse()
    }

    const token = await resource.issueToken({
      userId: authorizationCode.userId,
      scopes: authorizationCode.scopes,
      client,
      resource,
      ctx: this.ctx,
    })

    if (!token) return this.invalidGrantResponse()

    return this.ctx.response.ok({
      access_token: token.accessToken,
      token_type: token.tokenType ?? 'Bearer',
      ...(token.expiresIn === undefined ? {} : { expires_in: token.expiresIn }),
      scope: token.scope ?? authorizationCode.scopes.join(' '),
    })
  }

  private getPayload() {
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

  private disableCaching() {
    this.ctx.response.header('Cache-Control', 'no-store')
    this.ctx.response.header('Pragma', 'no-cache')
  }
}
