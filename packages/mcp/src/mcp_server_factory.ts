import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { McpConfig } from './types.js'

/**
 * Builds the MCP server for a request, with the tools already registered.
 *
 * A server is built per request rather than once, because every tool is built
 * from the HttpContext: that is how a tool reads the authenticated user and
 * resolves services from the request container.
 */
export default class McpServerFactory {
  constructor(readonly config: McpConfig) {}

  get guards() {
    return this.config.guards
  }

  get protectedResourceMetadataUrl() {
    return this.config.protectedResourceMetadataUrl
  }

  create(ctx: HttpContext) {
    const server = new McpServer(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        instructions: this.config.instructions,
      }
    )

    for (const tool of this.config.tools) {
      const { name, config, callback } = tool(ctx)
      server.registerTool(name, config, callback)
    }

    return server
  }
}
