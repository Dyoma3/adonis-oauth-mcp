/**
 * Package entrypoint.
 *
 * `node ace configure` imports the package root and looks for the `configure`
 * and `stubsRoot` exports, so both must be re-exported from here.
 */
export { configure } from './configure.js'
export { stubsRoot } from './stubs/main.js'

export { defineConfig } from './src/define_config.js'
export { default as McpServerFactory } from './src/mcp_server_factory.js'
export { default as McpRequestHandler } from './src/services/handler.js'
