import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import OAuthAuthorizationFlow from './authorization_flow.js'
import OAuthServer from '../oauth_server.js'

/**
 * Rejects an authorization request, redirecting back to the client with
 * `access_denied`. The resource, client and redirect URI are validated first,
 * so a denial cannot be used to redirect a user anywhere.
 */
@inject()
export default class OAuthDenyAuthorization extends OAuthAuthorizationFlow {
  constructor(ctx: HttpContext, server: OAuthServer) {
    super(ctx, server)
  }

  execute() {
    const payload = this.getPayload()
    if (!payload) return this.invalidRequestResponse('The authorization request is invalid')

    const resolution = this.resolve(payload)
    if (!resolution.ok) return resolution.response

    return this.redirectWithError(payload, 'access_denied')
  }
}
