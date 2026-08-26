/**
 * Package entrypoint.
 *
 * `node ace configure` imports the package root and looks for the `configure`
 * and `stubsRoot` exports, so both must be re-exported from here.
 */
export { configure } from './configure.js'
export { stubsRoot } from './stubs/main.js'

export { defineConfig } from './src/define_config.js'
export { default as OAuthServer } from './src/oauth_server.js'
export { default as OAuthApproveAuthorization } from './src/services/approve_authorization.js'
export { default as OAuthDenyAuthorization } from './src/services/deny_authorization.js'
export { default as OAuthTokenExchange } from './src/services/token_exchange.js'
export { default as OAuthAuthorizationCode } from './src/models/authorization_code.js'
export { default as OAuthRedirectUriMatcher } from './src/redirect_uri_matcher.js'

export type { AuthorizationRequestValidation } from './src/oauth_server.js'
