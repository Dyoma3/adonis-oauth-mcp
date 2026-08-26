import type { OAuthConfig } from './types.js'

/**
 * Identity helper that types `config/oauth.ts` while preserving the literal
 * types the application declares (scopes, client ids, resource ids).
 */
export function defineConfig<T extends OAuthConfig>(config: T): T {
  return config
}
