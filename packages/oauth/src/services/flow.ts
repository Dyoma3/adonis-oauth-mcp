import { HttpContext } from '@adonisjs/core/http'
import OAuthServer from '../oauth_server.js'

/**
 * Shared error responses for the OAuth endpoints. Every failure is reported
 * with an OAuth error code and a 400, never with the framework's validation
 * response, which clients cannot interpret.
 */
export default abstract class OAuthFlow {
  constructor(
    protected ctx: HttpContext,
    protected server: OAuthServer
  ) {}

  protected invalidRequestResponse(description?: string) {
    return this.ctx.response.badRequest({
      error: 'invalid_request',
      ...(description ? { error_description: description } : {}),
    })
  }

  protected invalidClientResponse() {
    return this.ctx.response.badRequest({ error: 'invalid_client' })
  }

  protected invalidGrantResponse() {
    return this.ctx.response.badRequest({ error: 'invalid_grant' })
  }

  protected invalidTargetResponse() {
    return this.ctx.response.badRequest({
      error: 'invalid_target',
      error_description: 'Unsupported OAuth resource',
    })
  }

  protected invalidRedirectUriResponse() {
    return this.ctx.response.badRequest({
      error: 'invalid_request',
      error_description: 'Invalid redirect_uri',
    })
  }
}
