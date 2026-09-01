import type { McpConfig } from './types.js'

/**
 * Identity helper that types `config/mcp.ts`. The guard names are inferred as
 * literals, so the auth middleware can pass them straight to
 * `ctx.auth.authenticateUsing`.
 */
export function defineConfig<Guard extends string>(config: McpConfig<Guard>): McpConfig<Guard> {
  return config
}
