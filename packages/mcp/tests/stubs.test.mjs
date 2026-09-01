/**
 * The stub engine (tempura) compiles a stub into a template literal, so any
 * backtick or interpolation the generated file needs must be escaped in the
 * stub. These tests render every stub the way `node ace configure` does.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Application } from '@adonisjs/core/app'
import ts from 'typescript'
import { stubsRoot } from '../build/stubs/main.js'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function render(stubPath, state = {}, options = {}) {
  const appRoot = await mkdtemp(join(options.parent ?? tmpdir(), 'adonis-mcp-'))
  const app = new Application(pathToFileURL(`${appRoot}/`), {
    importer: (filePath) => import(filePath),
    environment: 'console',
  })

  await app.init()

  const stubs = await app.stubs.create()
  const stub = await stubs.build(stubPath, { source: stubsRoot })
  const result = await stub.generate({ ...state, flags: {} })
  const contents = await readFile(result.destination, 'utf-8')

  if (!options.keep) await rm(appRoot, { recursive: true, force: true })

  return { ...result, contents, appRoot }
}

test('renders config/mcp.ts without the OAuth wiring', async () => {
  const { destination, appRoot, contents } = await render('config/mcp.stub', {
    serverName: 'my-app',
    guard: 'api',
    oauthResource: false,
  })

  assert.equal(destination, join(appRoot, 'config/mcp.ts'))
  assert.match(contents, /name: 'my-app'/)
  assert.match(contents, /guards: \['api'\]/)
  assert.match(contents, /import \{ tools \} from '\.\.\/app\/mcp\/tools\/main\.js'/)
  assert.match(contents, /\n  tools,\n/)
  assert.doesNotMatch(contents, /oauth/i, 'stays independent when OAuth is not installed')
})

test('wires the OAuth resource when it exists', async () => {
  const { contents } = await render('config/mcp.stub', {
    serverName: 'my-app',
    guard: 'api',
    oauthResource: true,
  })

  assert.match(contents, /import mcpResource from '\.\.\/app\/oauth_resources\/mcp_resource\.js'/)
  assert.match(contents, /protectedResourceMetadataUrl: mcpResource\.protectedResourceMetadataUrl/)
})

test('renders the auth middleware with its header intact', async () => {
  const { destination, appRoot, contents } = await render('middleware/mcp_auth_middleware.stub')

  assert.equal(destination, join(appRoot, 'app/middleware/mcp_auth_middleware.ts'))
  assert.match(
    contents,
    /`Bearer resource_metadata="\$\{mcpConfig\.protectedResourceMetadataUrl\}"`/
  )
  assert.match(contents, /authenticateUsing\(mcpConfig\.guards\)/)
})

test('renders the controller and the server instructions', async () => {
  const controller = await render('controllers/mcps_controller.stub')
  assert.equal(
    controller.destination,
    join(controller.appRoot, 'app/controllers/mcps_controller.ts')
  )
  assert.match(controller.contents, /handler: McpRequestHandler/)

  const instructions = await render('mcp/server_instructions.stub', {
    serverName: 'my-app',
  })
  assert.equal(
    instructions.destination,
    join(instructions.appRoot, 'app/mcp/server_instructions.ts')
  )
  assert.match(instructions.contents, /my-app exposes its data/)
})

test('renders the explicit tools registry', async () => {
  const { destination, appRoot, contents } = await render('mcp/tools/main.stub')

  assert.equal(destination, join(appRoot, 'app/mcp/tools/main.ts'))
  assert.match(contents, /import type \{ McpToolFactory \} from '@dinko\/adonis-mcp\/types'/)
  assert.match(contents, /export const tools: McpToolFactory\[\] = \[\]/)
})

test('renders a tool into its own file', async () => {
  const { destination, appRoot, contents } = await render('make/mcp_tool/main.stub', {
    entity: { path: './', name: 'get_skill' },
    fileName: 'get_skill.ts',
    factoryName: 'getSkillTool',
    toolName: 'get_skill',
    toolTitle: 'Get skill',
  })

  assert.equal(destination, join(appRoot, 'app/mcp/tools/get_skill.ts'))
  assert.match(contents, /export function getSkillTool\(ctx: HttpContext\): Tool/)
  assert.match(contents, /name: 'get_skill'/)
  assert.match(contents, /title: 'Get skill'/)
})

test('renders nested tools without flattening their paths or names', async () => {
  const { destination, appRoot, contents } = await render('make/mcp_tool/main.stub', {
    entity: { path: 'skills', name: 'get' },
    fileName: 'get.ts',
    factoryName: 'skillsGetTool',
    toolName: 'skills_get',
    toolTitle: 'Skills Get',
  })

  assert.equal(destination, join(appRoot, 'app/mcp/tools/skills/get.ts'))
  assert.match(contents, /export function skillsGetTool\(ctx: HttpContext\): Tool/)
  assert.match(contents, /name: 'skills_get'/)
})

test('the generated tool passes TypeScript semantic checks', async () => {
  const rendered = await render(
    'make/mcp_tool/main.stub',
    {
      entity: { path: './', name: 'get_skill' },
      fileName: 'get_skill.ts',
      factoryName: 'getSkillTool',
      toolName: 'get_skill',
      toolTitle: 'Get skill',
    },
    { keep: true, parent: packageRoot }
  )

  try {
    const program = ts.createProgram([rendered.destination], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    const errors = diagnostics.map((diagnostic) => {
      return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    })

    assert.deepEqual(errors, [])
  } finally {
    await rm(rendered.appRoot, { recursive: true, force: true })
  }
})
