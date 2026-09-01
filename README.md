# adonis-oauth-mcp

Monorepo for two AdonisJS packages. They version and release together, so
changes to the resource-registration contract never need cross-repo coordination.

| Package | Owns |
| --- | --- |
| [`@dinko/adonis-oauth`](packages/oauth/README.md) | OAuth 2.1 authorization server: approve / deny / token, redirect-URI validation, authorization-code storage, and the discovery metadata for the server and its protected resources. Knows nothing about MCP. |
| `@dinko/adonis-mcp` | MCP server: Streamable HTTP handler, per-request tools, dedicated access-token guard, and optional OAuth protected-resource scaffolding. |

The dependency runs one way: **mcp → oauth**. Nothing in `oauth` may import
from `mcp`.

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

To try a package in a real application, pack it and install the tarball:

```sh
cd packages/oauth
npm run build && npm pack
cd ../../../my-app
npm i ../adonis-oauth-mcp/packages/oauth/dinko-adonis-oauth-0.1.0.tgz
node ace configure @dinko/adonis-oauth
```

Not `npm link` or a `file:` dependency. Both symlink the package, and Node then
resolves its imports from this checkout, where `@adonisjs/core` is installed as
a devDependency. The application would end up with two copies of the framework,
and two different `HttpContext` classes — which breaks dependency injection,
since the container matches by class identity.
