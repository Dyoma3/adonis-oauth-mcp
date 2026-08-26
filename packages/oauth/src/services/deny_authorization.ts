import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import OAuthAuthorizationResolver from '../authorization_resolver.js'
import OAuthResponder from '../responder.js'
import OAuthServer from '../oauth_server.js'

/**
 * Rejects an authorization request, redirecting back to the client with
 * `access_denied`. The resource, client and redirect URI are validated first,
 * so a denial cannot be used to redirect a user anywhere.
 */
@inject()
export default class OAuthDenyAuthorization {
  constructor(
    private ctx: HttpContext,
    private server: OAuthServer
  ) {}

  execute() {
    const responder = new OAuthResponder(this.ctx, this.server.redirectMode)
    const authorization = new OAuthAuthorizationResolver(this.server)

    const payload = authorization.parse(this.ctx.request.body())
    if (!payload) return responder.invalidRequest('The authorization request is invalid')

    const resolution = authorization.resolve(payload)
    if (!resolution.ok) return responder.authorizationError(resolution.error)

    return responder.redirectWithError(payload, 'access_denied')
  }
}
