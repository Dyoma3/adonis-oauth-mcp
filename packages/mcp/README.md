# @dinko/adonis-mcp

An MCP server for AdonisJS v7 using the MCP Streamable HTTP transport. Tools
are built per request, so they can read the authenticated user and resolve
request-scoped application services from `HttpContext`.

Requires Node.js 24 or newer, `@adonisjs/auth` with an access-tokens guard, and
an `auth_access_tokens` migration. Tool schemas use Zod.

## Installation

For an MCP server with OAuth discovery, install and configure OAuth first:

```sh
npm install @dinko/adonis-oauth
node ace configure @dinko/adonis-oauth

npm install @dinko/adonis-mcp
node ace configure @dinko/adonis-mcp

node ace migration:run
```

MCP can also be configured without `@dinko/adonis-oauth`:

```sh
npm install @dinko/adonis-mcp
node ace configure @dinko/adonis-mcp
```

In that case authentication still uses the dedicated MCP guard, but a 401 can
only advertise `WWW-Authenticate: Bearer`; issuing tokens and publishing OAuth
protected-resource metadata are up to the application.

## What configure does

The configure hook creates the MCP boundary under `app/mcp` and wires it into
the application:

| File                                    | Purpose                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `config/mcp.ts`                         | Server identity, instructions, guards, OAuth metadata URL and the tools registry.  |
| `app/mcp/server_instructions.ts`        | Instructions sent to the client during initialization.                             |
| `app/mcp/tools/main.ts`                 | Explicit registry of tool factories.                                               |
| `app/controllers/mcps_controller.ts`    | Adapts Adonis HTTP requests to the MCP transport.                                  |
| `app/middleware/mcp_auth_middleware.ts` | Authenticates MCP tokens and emits the OAuth discovery challenge on 401.           |
| `start/routes.ts`                       | Registers `GET`, `POST` and `DELETE /mcp`; CORS preflight remains unauthenticated. |

It also registers the provider and Ace command, adds a dedicated `mcp` guard
and `User.mcpAccessTokens` provider, and excludes `/mcp` from the API starter
kit's `ForceJsonResponseMiddleware` when that middleware exists.

If OAuth was configured first, MCP also creates
`app/oauth_resources/mcp_resource.ts`, registers it in `config/oauth.ts`, and
uses `mcpAccessTokens` when exchanging an authorization code.

Review warnings printed by `configure`. Custom auth configs, user models or
JSON middleware shapes may require the equivalent edits by hand.

## Creating tools

Create a root tool or organize tools in folders:

```sh
node ace make:mcp-tool get_skill
node ace make:mcp-tool skills/get
```

The command creates the tool and updates only the application registry:

```ts
// app/mcp/tools/main.ts
import type { McpToolFactory } from '@dinko/adonis-mcp/types'
import { getSkillTool } from './get_skill.js'
import { skillsGetTool } from './skills/get.js'

export const tools: McpToolFactory[] = [getSkillTool, skillsGetTool]
```

`config/mcp.ts` imports this array; tool implementations do not live in the
configuration file. The command is idempotent, and `main` is reserved as the
root registry filename.

## Implementing a tool

The generated file contains:

- a factory receiving the current `HttpContext`;
- typed Zod input and output schemas, with strict output parsing;
- MCP annotations and descriptions;
- a callback returning both text content and `structuredContent`.

Keep HTTP response handling out of reusable application services. A tool should
resolve a request-scoped service and call a transport-neutral method:

```ts
async function run(ctx: HttpContext, input: { id: string }) {
  const service = await ctx.containerResolver.make(SkillShowService)
  return service.execute(input)
}
```

The generated output parser is intentional: if the service response drifts
from the advertised MCP schema, the call fails instead of silently publishing
an incorrect contract.

## Authentication

MCP tokens share the `auth_access_tokens` table with normal API tokens but use
a different provider type:

```ts
static mcpAccessTokens = DbAccessTokensProvider.forModel(User, { type: 'mcp' })
```

The generated `mcp` guard reads only that provider. A normal API access token
therefore cannot authenticate against `/mcp`.

With OAuth configured, anonymous requests receive a challenge like:

```http
WWW-Authenticate: Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/mcp"
```

## Content negotiation

MCP clients must advertise both supported response formats:

```http
Accept: application/json, text/event-stream
```

The Adonis API starter kit normally rewrites every `Accept` header to
`application/json`. The configure hook changes only that assignment so it does
not run for `/mcp`; other behavior in the middleware remains intact.

## Configuration

```ts
export default defineConfig({
  name: 'my-app',
  version: '0.1.0',
  instructions: mcpServerInstructions,
  guards: ['mcp'],
  protectedResourceMetadataUrl: mcpResource.protectedResourceMetadataUrl,
  tools,
})
```

`protectedResourceMetadataUrl` is optional when OAuth discovery is handled
elsewhere. `tools` is an array of `McpToolFactory` functions and normally comes
from `app/mcp/tools/main.ts`.
