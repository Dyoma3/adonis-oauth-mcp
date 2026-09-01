import app from '@adonisjs/core/services/app'
import McpServerFactory from '../src/mcp_server_factory.js'

let mcp: McpServerFactory

/**
 * Container service for the configured MCP server, for code that cannot use
 * dependency injection, such as a middleware reading the guards.
 */
await app.booted(async () => {
  mcp = await app.container.make(McpServerFactory)
})

export { mcp as default }
