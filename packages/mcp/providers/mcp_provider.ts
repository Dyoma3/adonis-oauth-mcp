import type { ApplicationService } from '@adonisjs/core/types'
import McpServerFactory from '../src/mcp_server_factory.js'
import type { McpConfig } from '../src/types.js'

export default class McpProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(McpServerFactory, async () => {
      const config = this.app.config.get<McpConfig | undefined>('mcp')

      if (!config) {
        throw new Error(
          'Missing MCP configuration. Run "node ace configure @dinko/adonis-mcp" to create config/mcp.ts'
        )
      }

      return new McpServerFactory(config)
    })
  }
}
