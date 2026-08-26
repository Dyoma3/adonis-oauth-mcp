import { HttpContext } from '@adonisjs/core/http'
import type { AuthorizationRequestPayload } from './validators.js'
import type { AuthorizationErrorKind } from './authorization_resolver.js'

/**
 * Speaks OAuth back to the client. Every failure is reported with an OAuth
 * error code and a 400, never with the framework's validation response, which
 * clients cannot interpret.
 */
export default class OAuthResponder {
  constructor(private ctx: HttpContext) {}

  invalidRequest(description?: string) {
    return this.ctx.response.badRequest({
      error: 'invalid_request',
      ...(description ? { error_description: description } : {}),
    })
  }

  invalidClient() {
    return this.ctx.response.badRequest({ error: 'invalid_client' })
  }

  invalidGrant() {
    return this.ctx.response.badRequest({ error: 'invalid_grant' })
  }

  /**
   * Turns the reason an authorization request could not be resolved into its
   * response, so approve and deny report the same failure the same way.
   */
  authorizationError(kind: AuthorizationErrorKind) {
    if (kind === 'invalid_target') {
      return this.ctx.response.badRequest({
        error: 'invalid_target',
        error_description: 'Unsupported OAuth resource',
      })
    }

    if (kind === 'invalid_client') return this.invalidClient()

    return this.ctx.response.badRequest({
      error: 'invalid_request',
      error_description: 'Invalid redirect_uri',
    })
  }

  unauthenticated() {
    return this.ctx.response.unauthorized({
      error: 'access_denied',
      error_description:
        'The approve endpoint requires an authenticated user. Protect it with your authentication middleware, or set `authenticatedUserId` in config/oauth.ts.',
    })
  }

  redirectWithError(payload: AuthorizationRequestPayload, error: string) {
    return this.redirect(payload.redirect_uri, { error, state: payload.state })
  }

  redirectWithAuthorizationCode(payload: AuthorizationRequestPayload, code: string) {
    return this.redirect(payload.redirect_uri, { code, state: payload.state })
  }

  private redirect(redirectUri: string, params: Record<string, string | undefined>) {
    const redirectUrl = new URL(redirectUri)

    Object.entries(params).forEach(([key, value]) => {
      if (value) redirectUrl.searchParams.set(key, value)
    })

    return this.ctx.response.redirect(redirectUrl.toString())
  }
}
