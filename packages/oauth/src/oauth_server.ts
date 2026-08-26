import OAuthRedirectUriMatcher from './redirect_uri_matcher.js'
import { authorizationRequestValidator } from './validators.js'
import { parseScopes } from './scopes.js'
import type {
  AuthorizationServerMetadata,
  OAuthClientConfig,
  OAuthConfig,
  OAuthRedirectMode,
  OAuthResourceConfig,
  ProtectedResourceMetadata,
} from './types.js'

const DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60

const authorizationParamNames = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'resource',
] as const

const requiredAuthorizationParamNames = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'resource',
] as const

type AuthorizationParamName = (typeof authorizationParamNames)[number]
type AuthorizationParams = Partial<Record<AuthorizationParamName, string>>

export type AuthorizationRequestValidation =
  | {
      valid: false
      error: string
      missingParams: string[]
      invalidParams: string[]
    }
  | {
      valid: true
      params: AuthorizationParams
      resource: OAuthResourceConfig
      client: OAuthClientConfig
      scopes: string[]
      fields: { name: string; value: string }[]
    }

/**
 * Reads the OAuth configuration and answers everything derived from it:
 * resource lookups, discovery metadata, and validation of an incoming
 * authorization request.
 */
export default class OAuthServer {
  constructor(readonly config: OAuthConfig) {}

  get resources() {
    return this.config.resources
  }

  get redirectMode(): OAuthRedirectMode {
    return this.config.redirectMode ?? 'json'
  }

  get authorizationCodeTtlSeconds() {
    return this.config.authorizationCodeTtlSeconds ?? DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS
  }

  /**
   * Finds a resource by its canonical resource indicator, the value clients
   * send as the `resource` parameter.
   */
  getResource(resource: string) {
    return this.config.resources.find((candidate) => candidate.resource === resource) ?? null
  }

  /**
   * Finds a resource by its slug, the value used in its protected-resource
   * metadata URL.
   */
  getResourceById(id: string) {
    return this.config.resources.find((candidate) => candidate.id === id) ?? null
  }

  getClient(resource: OAuthResourceConfig, clientId: string) {
    return resource.clients.find((candidate) => candidate.id === clientId) ?? null
  }

  supportedScopes() {
    return [...new Set(this.config.resources.flatMap((resource) => [...resource.scopes]))]
  }

  authorizationServerMetadata(): AuthorizationServerMetadata {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: this.config.authorizationEndpoint,
      token_endpoint: this.config.tokenEndpoint,
      token_endpoint_auth_methods_supported: this.config.tokenEndpointAuthMethods ?? ['none'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: this.supportedScopes(),
    }
  }

  protectedResourceMetadata(id: string): ProtectedResourceMetadata | null {
    const resource = this.getResourceById(id)
    if (!resource) return null

    return {
      resource: resource.resource,
      authorization_servers: [this.config.issuer],
      scopes_supported: [...resource.scopes],
      bearer_methods_supported: ['header'],
      ...(resource.resourceName ? { resource_name: resource.resourceName } : {}),
    }
  }

  /**
   * Validates the query string of an authorization request without deciding
   * anything about it: the consent screen belongs to the application, so this
   * only reports whether the request is worth rendering, which scopes were
   * asked for, and the fields to post back to the approve endpoint.
   *
   * Optional. Applications rendering their consent screen elsewhere (a SPA,
   * for instance) can skip it, since approve and deny validate again.
   */
  validateAuthorizationRequest(query: Record<string, unknown>): AuthorizationRequestValidation {
    const params = this.readAuthorizationParams(query)
    const missingParams = requiredAuthorizationParamNames.filter((name) => !params[name])

    if (missingParams.length) {
      return {
        valid: false,
        error: `The authorization request is missing: ${missingParams.join(', ')}`,
        missingParams: [...missingParams],
        invalidParams: [],
      }
    }

    const validation = authorizationRequestValidator.safeParse(params)

    if (!validation.success) {
      const invalidParams = [
        ...new Set(
          validation.error.issues
            .map((issue) => issue.path[0])
            .filter((name): name is string => typeof name === 'string')
        ),
      ]

      return {
        valid: false,
        error: `The authorization request has invalid parameters: ${invalidParams.join(', ')}`,
        missingParams: [],
        invalidParams,
      }
    }

    const resource = this.getResource(validation.data.resource)

    if (!resource) {
      return {
        valid: false,
        error: 'The requested OAuth resource is not supported.',
        missingParams: [],
        invalidParams: ['resource'],
      }
    }

    const client = this.getClient(resource, validation.data.client_id)

    if (!client) {
      return {
        valid: false,
        error: 'The OAuth client is not recognized.',
        missingParams: [],
        invalidParams: ['client_id'],
      }
    }

    if (!new OAuthRedirectUriMatcher(client, validation.data.redirect_uri).execute()) {
      return {
        valid: false,
        error: 'The OAuth redirect URI is not allowed.',
        missingParams: [],
        invalidParams: ['redirect_uri'],
      }
    }

    return {
      valid: true,
      params,
      resource,
      client,
      scopes: parseScopes(validation.data.scope, client.allowedScopes),
      fields: Object.entries(validation.data).flatMap(([name, value]) =>
        value === undefined ? [] : [{ name, value: String(value) }]
      ),
    }
  }

  private readAuthorizationParams(query: Record<string, unknown>) {
    return authorizationParamNames.reduce<AuthorizationParams>((params, name) => {
      const value = query[name]
      if (typeof value === 'string') params[name] = value
      return params
    }, {})
  }
}
