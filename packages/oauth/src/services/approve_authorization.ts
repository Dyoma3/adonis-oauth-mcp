import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import OAuthAuthorizationFlow from './authorization_flow.js'
import OAuthAuthorizationCode from '../models/authorization_code.js'
import OAuthServer from '../oauth_server.js'
import { parseScopes } from '../scopes.js'
import type { AuthorizationRequestPayload } from '../validators.js'
import type { OAuthClientConfig } from '../types.js'

/**
 * Grants an authorization request: issues a single-use authorization code and
 * redirects back to the client with it.
 *
 * The route must be protected by the application's authentication middleware,
 * since the code is bound to the user granting access.
 */
@inject()
export default class OAuthApproveAuthorization extends OAuthAuthorizationFlow {
  constructor(ctx: HttpContext, server: OAuthServer) {
    super(ctx, server)
  }

  async execute() {
    const payload = this.getPayload()
    if (!payload) return this.invalidRequestResponse('The authorization request is invalid')

    const resolution = this.resolve(payload)
    if (!resolution.ok) return resolution.response

    const { client } = resolution
    const scopes = parseScopes(payload.scope, client.allowedScopes)

    if (!this.clientAllowsScopes(client, scopes)) {
      return this.redirectWithError(payload, 'invalid_scope')
    }

    const userId = this.getAuthenticatedUserId()
    if (userId === null) return this.unauthenticatedResponse()

    const { code } = await OAuthAuthorizationCode.issue(
      {
        userId,
        clientId: client.id,
        redirectUri: payload.redirect_uri,
        resource: payload.resource,
        scopes,
        codeChallenge: payload.code_challenge,
        codeChallengeMethod: payload.code_challenge_method,
      },
      this.server.authorizationCodeTtlSeconds
    )

    return this.redirectWithAuthorizationCode(payload, code)
  }

  private clientAllowsScopes(client: OAuthClientConfig, scopes: string[]) {
    const allowedScopes = new Set<string>(client.allowedScopes)
    return scopes.every((scope) => allowedScopes.has(scope))
  }

  private redirectWithAuthorizationCode(payload: AuthorizationRequestPayload, code: string) {
    return this.ctx.response.redirect(
      this.buildRedirectUrl(payload.redirect_uri, { code, state: payload.state })
    )
  }
}
