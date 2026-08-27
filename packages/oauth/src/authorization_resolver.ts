import OAuthRedirectUriMatcher from './redirect_uri_matcher.js'
import OAuthServer from './oauth_server.js'
import { authorizationRequestValidator, authorizationTargetValidator } from './validators.js'
import type { AuthorizationTarget } from './validators.js'
import type { OAuthClientConfig, OAuthResourceConfig } from './types.js'

export type AuthorizationErrorKind = 'invalid_target' | 'invalid_client' | 'invalid_redirect_uri'

export type AuthorizationResolution =
  | { ok: true; resource: OAuthResourceConfig; client: OAuthClientConfig }
  | { ok: false; error: AuthorizationErrorKind }

/**
 * Reads the authorization request posted back by the consent screen, and
 * confirms the resource, the client and the redirect URI behind it. Approve
 * and deny both need this before doing anything with the request.
 *
 * Reports why it failed rather than how to answer, so the response stays with
 * the caller.
 */
export default class OAuthAuthorizationResolver {
  constructor(private server: OAuthServer) {}

  /**
   * Reads only what is needed to decide whether the redirect URI can be
   * trusted. Everything else is validated afterwards, once it can be.
   */
  parseTarget(body: unknown) {
    const parsed = authorizationTargetValidator.safeParse(body)
    return parsed.success ? parsed.data : null
  }

  parse(body: unknown) {
    const parsed = authorizationRequestValidator.safeParse(body)
    return parsed.success ? parsed.data : null
  }

  resolve(target: AuthorizationTarget): AuthorizationResolution {
    const resource = this.server.getResource(target.resource)
    if (!resource) return { ok: false, error: 'invalid_target' }

    const client = this.server.getClient(resource, target.client_id)
    if (!client) return { ok: false, error: 'invalid_client' }

    if (!new OAuthRedirectUriMatcher(client, target.redirect_uri).execute()) {
      return { ok: false, error: 'invalid_redirect_uri' }
    }

    return { ok: true, resource, client }
  }
}
