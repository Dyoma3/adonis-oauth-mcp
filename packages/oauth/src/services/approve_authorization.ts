import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import OAuthAuthorizationResolver from '../authorization_resolver.js'
import OAuthAuthorizationCode from '../models/authorization_code.js'
import OAuthResponder from '../responder.js'
import OAuthServer from '../oauth_server.js'
import { parseScopes } from '../scopes.js'
import type { OAuthClientConfig } from '../types.js'

/**
 * A context that may carry an authenticated user, without depending on
 * `@adonisjs/auth` for the type. Applications using another authentication
 * package point `authenticatedUserId` at their own resolver instead.
 */
type MaybeAuthenticatedContext = HttpContext & {
  auth?: { user?: { id?: string | number } }
}

/**
 * Grants an authorization request: issues a single-use authorization code and
 * redirects back to the client with it.
 *
 * The route must be protected by the application's authentication middleware,
 * since the code is bound to the user granting access.
 */
@inject()
export default class OAuthApproveAuthorization {
  constructor(
    private ctx: HttpContext,
    private server: OAuthServer
  ) {}

  async execute() {
    const responder = new OAuthResponder(this.ctx)
    const authorization = new OAuthAuthorizationResolver(this.server)

    const payload = authorization.parse(this.ctx.request.body())
    if (!payload) return responder.invalidRequest('The authorization request is invalid')

    const resolution = authorization.resolve(payload)
    if (!resolution.ok) return responder.authorizationError(resolution.error)

    const { client } = resolution
    const scopes = parseScopes(payload.scope, client.allowedScopes)

    if (!this.clientAllowsScopes(client, scopes)) {
      return responder.redirectWithError(payload, 'invalid_scope')
    }

    const userId = this.resolveUserId()
    if (userId === null) return responder.unauthenticated()

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

    return responder.redirectWithAuthorizationCode(payload, code)
  }

  /**
   * The id of the user granting access. Reading it from `ctx.auth` by default
   * covers `@adonisjs/auth`; anything else is configured explicitly.
   */
  private resolveUserId() {
    const resolve = this.server.config.authenticatedUserId
    const userId = resolve
      ? resolve(this.ctx)
      : (this.ctx as MaybeAuthenticatedContext).auth?.user?.id

    return userId ?? null
  }

  private clientAllowsScopes(client: OAuthClientConfig, scopes: string[]) {
    const allowedScopes = new Set<string>(client.allowedScopes)
    return scopes.every((scope) => allowedScopes.has(scope))
  }
}
