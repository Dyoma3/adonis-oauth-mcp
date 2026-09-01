import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import McpServerFactory from '../mcp_server_factory.js'

/**
 * Answers one MCP request.
 *
 * The SDK writes to the raw Node response, so the framework's response is not
 * used here beyond reaching it. Both the server and the transport are built
 * for this request and closed when it ends.
 */
@inject()
export default class McpRequestHandler {
  constructor(
    private ctx: HttpContext,
    private factory: McpServerFactory
  ) {}

  async execute() {
    const server = this.factory.create(this.ctx)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })

    this.ctx.response.response.once('close', () => {
      void this.closeResources(server, transport)
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(
        this.ctx.request.request,
        this.ctx.response.response,
        this.ctx.request.body()
      )
    } catch (error) {
      this.ctx.logger.error({ err: error }, 'Failed to handle MCP request')
      this.writeInternalError()
    }
  }

  private async closeResources(server: McpServer, transport: StreamableHTTPServerTransport) {
    try {
      await Promise.all([transport.close(), server.close()])
    } catch (error) {
      this.ctx.logger.warn({ err: error }, 'Failed to close MCP request resources')
    }
  }

  /**
   * A JSON-RPC error, written to the raw response: the transport may already
   * have taken it over, and the framework's response would not reach it.
   */
  private writeInternalError() {
    const rawResponse = this.ctx.response.response

    if (rawResponse.writableEnded || rawResponse.destroyed) return

    if (rawResponse.headersSent) {
      rawResponse.end()
      return
    }

    rawResponse.writeHead(500, { 'Content-Type': 'application/json' })
    rawResponse.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      })
    )
  }
}
