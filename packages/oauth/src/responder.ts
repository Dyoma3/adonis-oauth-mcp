import { HttpContext } from '@adonisjs/core/http'
import type { AuthorizationTarget } from './validators.js'
import type { AuthorizationErrorKind } from './authorization_resolver.js'
import type { OAuthRedirectMode } from './types.js'

/**
 * Speaks OAuth back to the client. Every failure is reported with an OAuth
 * error code and a 400, never with the framework's validation response, which
 * clients cannot interpret.
 */
export default class OAuthResponder {
  constructor(
    private ctx: HttpContext,
    private redirectMode: OAuthRedirectMode = 'json'
  ) {}

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

  redirectWithError(target: AuthorizationTarget, error: string) {
    return this.redirect(target.redirect_uri, { error, state: target.state })
  }

  redirectWithAuthorizationCode(target: AuthorizationTarget, code: string) {
    return this.redirect(target.redirect_uri, { code, state: target.state })
  }

  /**
   * Sends the client back to its redirect URI, either by redirecting or by
   * handing the URL to the consent screen so it can navigate itself. See
   * `OAuthRedirectMode`.
   */
  private redirect(redirectUri: string, params: Record<string, string | undefined>) {
    const redirectUrl = new URL(redirectUri)

    Object.entries(params).forEach(([key, value]) => {
      if (value) redirectUrl.searchParams.set(key, value)
    })

    if (this.redirectMode === 'http') {
      return this.ctx.response.redirect(redirectUrl.toString())
    }

    return this.ctx.response.ok({ redirect_to: redirectUrl.toString() })
  }
}
