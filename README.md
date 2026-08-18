# adonis-oauth-mcp

Monorepo for two AdonisJS packages. They version and release together, so
changes to the resource-registration contract never need cross-repo coordination.

| Package | Owns |
| --- | --- |
| `packages/oauth` (`@dinko/adonis-oauth`) | OAuth 2.1 authorization server: token / approve / deny, redirect-URI validation, authorization-code storage, authorization-server metadata, and a generic protected-resource metadata endpoint driven by a resource registry. Knows nothing about MCP. |
| `packages/mcp` (`@dinko/adonis-mcp`) | MCP server: request handler, controller, tool contract, auth middleware. Registers itself as an OAuth protected resource, declaring its resource URL, scopes, clients, `resource_name` and token provider. |

The dependency runs one way: **mcp → oauth**. Nothing in `oauth` may import
from `mcp`.

## Layout

Each package follows the AdonisJS package convention:

```
index.ts       re-exports `configure` and `stubsRoot` (what `node ace configure` imports)
configure.ts   the configure hook, driving codemods and stubs
stubs/         .stub templates rendered into the target app
src/           runtime code the app imports
providers/     service providers registered by the configure hook
```

## Development

```sh
npm install     # links the workspaces
npm run build   # tsc + copy stubs, per package
npm run typecheck
```

## Using in an app

Both packages must be installed and configured in the target app, oauth first:

```sh
npm i @dinko/adonis-oauth @dinko/adonis-mcp
node ace configure @dinko/adonis-oauth
node ace configure @dinko/adonis-mcp
```

While developing, install from this checkout (`npm link`, `file:` or a git
dependency) rather than the registry.
