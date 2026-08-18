import type Configure from '@adonisjs/core/commands/configure'

/**
 * Configure hook, run by `node ace configure @dinko/adonis-mcp`.
 *
 * Expects @dinko/adonis-oauth to be configured first.
 */
export async function configure(_command: Configure) {
  // TODO: generate config/mcp.ts and app/mcp/tools/, register the provider,
  // the mcpAuth named middleware, the /mcp route and the mcp test suite.
}
