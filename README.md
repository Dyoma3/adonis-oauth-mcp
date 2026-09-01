# adonis-oauth-mcp

OAuth 2.1 and MCP building blocks for AdonisJS v7 applications.

Both packages require Node.js 24 or newer and are designed for AdonisJS v7.

| Package                                           | Owns                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@dinko/adonis-oauth`](packages/oauth/README.md) | OAuth 2.1 authorization server: approve / deny / token, redirect-URI validation, authorization-code storage, and the discovery metadata for the server and its protected resources. Knows nothing about MCP. |
| [`@dinko/adonis-mcp`](packages/mcp/README.md)     | MCP server: Streamable HTTP transport, per-request tools, a dedicated access-token guard, and optional OAuth protected-resource scaffolding.                                                                 |

The packages do not import each other at runtime. The optional integration runs
in one direction: when MCP is configured after OAuth, it creates and registers
the OAuth protected resource it needs. OAuth knows nothing about MCP.

## Install both

Configure OAuth first so MCP can detect it and wire discovery and token issuing:

```sh
npm install @dinko/adonis-oauth
node ace configure @dinko/adonis-oauth

npm install @dinko/adonis-mcp
node ace configure @dinko/adonis-mcp

node ace migration:run
```

The MCP package expects an application using the `@adonisjs/auth` access-tokens
guard and its `auth_access_tokens` migration. See each package README for the
generated files and the application decisions left to you.

## Layout

Each package follows the AdonisJS package convention:

```
index.ts       re-exports `configure` and `stubsRoot` (what `node ace configure` imports)
configure.ts   the configure hook, driving codemods and stubs
commands/      ace commands, indexed into commands.json at build time
stubs/         .stub templates rendered into the target app
src/           runtime code the app imports
providers/     service providers registered by the configure hook
services/      container services, for code that cannot use dependency injection
tests/         node:test suites, run against build/
```

## Development

```sh
npm install
npm run build       # tsc, stubs and the command index, per package
npm run typecheck
npm test            # runs against build/, so build first
```

To try a package in a real application, pack it and install the tarball. Pack
and configure OAuth before MCP when testing their integration:

```sh
cd packages/oauth
npm run build
npm pack

cd ../mcp
npm run build
npm pack

cd ../../../my-app
npm i ../adonis-oauth-mcp/packages/oauth/dinko-adonis-oauth-0.1.0.tgz
node ace configure @dinko/adonis-oauth

npm i ../adonis-oauth-mcp/packages/mcp/dinko-adonis-mcp-0.1.0.tgz
node ace configure @dinko/adonis-mcp
```

Not `npm link` or a `file:` dependency. Both symlink the package, and Node then
resolves its imports from this checkout, where `@adonisjs/core` is installed as
a devDependency. The application would end up with two copies of the framework,
and two different `HttpContext` classes — which breaks dependency injection,
since the container matches by class identity.
