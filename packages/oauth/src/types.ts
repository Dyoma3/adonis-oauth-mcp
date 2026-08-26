import type { HttpContext } from '@adonisjs/core/http'

/**
 * An OAuth client allowed to request access to a resource.
 */
export type OAuthClientConfig<TScope extends string = string> = {
  id: string
  name?: string
  redirectUris: readonly string[]
  redirectUriPatterns?: readonly string[]
  allowedScopes: readonly TScope[]
}

/**
 * Everything the application needs to mint an access token, handed to
 * `issueToken` once the authorization code has been validated and consumed.
 *
 * `userId` is the id stored with the authorization code. The package never
 * loads the user itself, since it has no knowledge of the app's user model.
 */
export type IssueTokenContext = {
  userId: string | number
  scopes: string[]
  client: OAuthClientConfig
  resource: OAuthResourceConfig
  ctx: HttpContext
}

/**
 * The token returned by `issueToken`. Returning `null` instead rejects the
 * exchange with `invalid_grant`, which is what you want when the user behind
 * the authorization code no longer exists.
 */
export type IssuedToken = {
  accessToken: string
  expiresIn?: number
  tokenType?: string
  scope?: string
}

/**
 * A protected resource this authorization server issues tokens for.
 *
 * `id` is the slug used in the protected-resource metadata URL
 * (`/.well-known/oauth-protected-resource/<id>`), while `resource` is the
 * canonical resource indicator clients send as the `resource` parameter.
 */
export type OAuthResourceConfig<TScope extends string = string> = {
  id: string
  resource: string
  resourceName?: string
  protectedResourceMetadataUrl?: string
  scopes: readonly TScope[]
  clients: readonly OAuthClientConfig<TScope>[]
  issueToken(context: IssueTokenContext): Promise<IssuedToken | null> | IssuedToken | null
}

export type OAuthConfig = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  tokenEndpointAuthMethods?: readonly string[]
  authorizationCodeTtlSeconds?: number
  authorizationCodesTable?: string

  /**
   * How to read the user granting access on the approve endpoint. Defaults to
   * `ctx.auth.user.id`, which covers `@adonisjs/auth`.
   */
  authenticatedUserId?: (ctx: HttpContext) => string | number | null | undefined

  resources: readonly OAuthResourceConfig[]
}

export type AuthorizationServerMetadata = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  token_endpoint_auth_methods_supported: readonly string[]
  response_types_supported: readonly string[]
  grant_types_supported: readonly string[]
  code_challenge_methods_supported: readonly string[]
  scopes_supported: readonly string[]
}

export type ProtectedResourceMetadata = {
  resource: string
  authorization_servers: readonly string[]
  scopes_supported: readonly string[]
  bearer_methods_supported: readonly string[]
  resource_name?: string
}
