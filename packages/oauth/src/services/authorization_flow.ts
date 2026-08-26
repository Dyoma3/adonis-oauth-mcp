import { HttpContext } from '@adonisjs/core/http'
import OAuthFlow from './flow.js'
import OAuthRedirectUriMatcher from '../redirect_uri_matcher.js'
import { authorizationRequestValidator } from '../validators.js'
import type { AuthorizationRequestPayload } from '../validators.js'

/**
 * A context that may carry an authenticated user, without depending on
 * `@adonisjs/auth` for the type. Applications using another authentication
 * package point `authenticatedUserId` at their own resolver instead.
 */
type MaybeAuthenticatedContext = HttpContext & {
  auth?: { user?: { id?: string | number } }
}

/**
 * What the approve and deny endpoints have in common: both read the same
 * posted authorization request, and both must confirm the resource, the
 * client and the redirect URI before doing anything with them.
 */
export default abstract class OAuthAuthorizationFlow extends OAuthFlow {
  protected getPayload() {
    const parsed = authorizationRequestValidator.safeParse(this.ctx.request.body())
    return parsed.success ? parsed.data : null
  }

  protected resolve(payload: AuthorizationRequestPayload) {
    const resource = this.server.getResource(payload.resource)
    if (!resource) return { ok: false as const, response: this.invalidTargetResponse() }

    const client = this.server.getClient(resource, payload.client_id)
    if (!client) return { ok: false as const, response: this.invalidClientResponse() }

    if (!new OAuthRedirectUriMatcher(client, payload.redirect_uri).execute()) {
      return { ok: false as const, response: this.invalidRedirectUriResponse() }
    }

    return { ok: true as const, resource, client }
  }

  /**
   * The id of the user granting access. Reading it from `ctx.auth` by default
   * covers `@adonisjs/auth`; anything else is configured explicitly.
   */
  protected getAuthenticatedUserId() {
    const resolve = this.server.config.authenticatedUserId
    const userId = resolve
      ? resolve(this.ctx)
      : (this.ctx as MaybeAuthenticatedContext).auth?.user?.id

    return userId ?? null
  }

  protected unauthenticatedResponse() {
    return this.ctx.response.unauthorized({
      error: 'access_denied',
      error_description:
        'The approve endpoint requires an authenticated user. Protect it with your authentication middleware, or set `authenticatedUserId` in config/oauth.ts.',
    })
  }

  protected buildRedirectUrl(redirectUri: string, params: Record<string, string | undefined>) {
    const redirectUrl = new URL(redirectUri)

    Object.entries(params).forEach(([key, value]) => {
      if (value) redirectUrl.searchParams.set(key, value)
    })

    return redirectUrl.toString()
  }

  protected redirectWithError(payload: AuthorizationRequestPayload, error: string) {
    return this.ctx.response.redirect(
      this.buildRedirectUrl(payload.redirect_uri, { error, state: payload.state })
    )
  }
}
