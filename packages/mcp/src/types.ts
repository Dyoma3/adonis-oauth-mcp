import type { HttpContext } from '@adonisjs/core/http'
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

type McpToolOutputSchema = ZodRawShapeCompat | AnySchema
type McpToolInputSchema = undefined | ZodRawShapeCompat | AnySchema

/**
 * A tool as the MCP SDK expects it: a name, the schemas and annotations that
 * describe it to the client, and the callback that runs it.
 */
export type McpTool<
  OutputSchema extends McpToolOutputSchema = ZodRawShapeCompat,
  InputSchema extends McpToolInputSchema = ZodRawShapeCompat,
> = {
  name: string
  config: {
    title?: string
    description?: string
    inputSchema?: InputSchema
    outputSchema?: OutputSchema
    annotations?: ToolAnnotations
    _meta?: Record<string, unknown>
  }
  callback: ToolCallback<InputSchema>
}

/**
 * Tools are built per request, so each one can read the authenticated user and
 * resolve services from the request container.
 */
export type McpToolFactory = (ctx: HttpContext) => McpTool<any, any>

export type McpConfig<Guard extends string = string> = {
  /**
   * Name and version of the server, as reported to clients on initialize.
   */
  name: string
  version: string

  /**
   * Prose telling the client what this server is for and how to use it well.
   */
  instructions?: string

  /**
   * The guards the auth middleware authenticates with. Kept here so the
   * middleware does not have to name one of yours.
   */
  guards: Guard[]

  /**
   * Advertised in the WWW-Authenticate header of a 401, so a client can
   * discover which authorization server protects this one. With
   * @dinko/adonis-oauth this is the resource's protectedResourceMetadataUrl.
   */
  protectedResourceMetadataUrl?: string

  tools: McpToolFactory[]
}
