import { access, readFile, readdir } from 'node:fs/promises'
import type Configure from '@adonisjs/core/commands/configure'
import type {
  BinaryExpression,
  Block,
  ExpressionStatement,
  IfStatement,
  IndentationText,
  SourceFile,
} from 'ts-morph'
import { stubsRoot } from './stubs/main.js'
import { registerAuthGuard, registerTokenProvider } from './configure_auth.js'

const MCP_ROUTE_PATH = 'mcp'
const MCP_REQUEST_PATH = `/${MCP_ROUTE_PATH}`
const MCP_ROUTE = `
/*
|--------------------------------------------------------------------------
| MCP
|--------------------------------------------------------------------------
|
| One route answers everything: the protocol multiplexes initialize,
| tools/list and tools/call over the same endpoint, so there is nothing to
| split up here.
|
| The middleware authenticates with the guards named in config/mcp.ts.
|
*/
const McpsController = () => import('#controllers/mcps_controller')

router
  .group(() => {
    router.get('', [McpsController, 'handle']).as('mcp.get')
    router.post('', [McpsController, 'handle']).as('mcp.post')
    router.delete('', [McpsController, 'handle']).as('mcp.delete')
  })
  .prefix('${MCP_ROUTE_PATH}')
  .use(middleware.mcpAuth())
`

/**
 * Configure hook, run by `node ace configure @dinko/adonis-mcp`.
 *
 * When @dinko/adonis-oauth is configured in the same application, this also
 * scaffolds the OAuth resource for the MCP server and points the middleware at
 * its discovery URL. The packages themselves stay independent: what connects
 * them is the generated code.
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods()
  const oauthConfigured = await hasOauthConfig(command)
  let oauthResource = false
  const guard = 'mcp'
  const tokensProvider = 'mcpAccessTokens'

  if (oauthConfigured) {
    const resourceCommand = await command.kernel.exec('make:oauth-resource', [
      MCP_ROUTE_PATH,
      '--tokens-provider=mcpAccessTokens',
    ])

    if (resourceCommand.error || (resourceCommand.exitCode ?? 0) !== 0) {
      throw resourceCommand.error ?? new Error('Could not create the MCP OAuth resource')
    }

    oauthResource = await hasMcpOauthResource(command)
    if (!oauthResource) {
      throw new Error(
        'The OAuth resource command completed without creating and registering app/oauth_resources/mcp_resource.ts'
      )
    }
  }

  await warnAboutMissingAccessTokensTable(command)

  await codemods.makeUsingStub(stubsRoot, 'mcp/tools/main.stub', {})

  await codemods.makeUsingStub(stubsRoot, 'config/mcp.stub', {
    oauthResource,
    serverName: command.app.appName,
    guard,
  })

  await codemods.makeUsingStub(stubsRoot, 'mcp/server_instructions.stub', {
    serverName: command.app.appName,
  })

  await codemods.makeUsingStub(stubsRoot, 'controllers/mcps_controller.stub', {})
  await codemods.makeUsingStub(stubsRoot, 'middleware/mcp_auth_middleware.stub', {})

  await codemods.registerMiddleware('named', [
    { name: 'mcpAuth', path: '#middleware/mcp_auth_middleware' },
  ])

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@dinko/adonis-mcp/mcp_provider')
    rcFile.addCommand('@dinko/adonis-mcp/commands')
  })

  await registerAuthGuard(command, codemods, guard, tokensProvider)
  await registerTokenProvider(command, codemods, tokensProvider, guard)
  await excludeMcpFromForceJsonMiddleware(command, codemods)
  await registerRoute(command, codemods)
}

async function hasOauthConfig(command: Configure) {
  try {
    await access(command.app.configPath('oauth.ts'))
    return true
  } catch {
    return false
  }
}

async function hasMcpOauthResource(command: Configure) {
  try {
    await access(command.app.makePath('app/oauth_resources/mcp_resource.ts'))
    const oauthConfig = await readFile(command.app.configPath('oauth.ts'), 'utf8')

    return (
      oauthConfig.includes('mcp_resource') &&
      /resources\s*:\s*\[[\s\S]*\bmcpResource\b/.test(oauthConfig)
    )
  } catch {
    return false
  }
}

async function warnAboutMissingAccessTokensTable(command: Configure) {
  try {
    const migrationsPath = command.app.migrationsPath()
    const migrations = await readdir(migrationsPath)
    const migrationSources = await Promise.all(
      migrations
        .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
        .map((file) => readFile(command.app.migrationsPath(file), 'utf8'))
    )

    if (migrationSources.some((source) => source.includes('auth_access_tokens'))) return
  } catch {
    // The warning below also covers applications with no migrations directory.
  }

  command.logger.warning(
    'the MCP guard requires the auth_access_tokens table; configure the @adonisjs/auth access_tokens guard before issuing MCP tokens'
  )
}

async function excludeMcpFromForceJsonMiddleware(
  command: Configure,
  codemods: Awaited<ReturnType<Configure['createCodemods']>>
) {
  const project = await codemods.getTsMorphProject()
  const middlewareFile = project?.getSourceFile(
    command.app.middlewarePath('force_json_response_middleware.ts')
  )

  if (!middlewareFile) return

  const result = addMcpExclusionToForceJsonMiddleware(middlewareFile)

  if (result === 'updated') {
    await middlewareFile.save()
    command.logger.action('update app/middleware/force_json_response_middleware.ts').succeeded()
    return
  }

  if (result === 'unsupported') {
    command.logger.warning(
      'exclude /mcp from app/middleware/force_json_response_middleware.ts manually'
    )
  }
}

/**
 * Keeps the API starter kit's JSON content negotiation away from MCP, whose
 * Accept header must continue advertising both JSON and event streams.
 */
export function addMcpExclusionToForceJsonMiddleware(sourceFile: SourceFile) {
  useAdonisFormatting(sourceFile)

  const middleware = sourceFile.getClasses().find((candidate) => candidate.isDefaultExport())
  const handle = middleware?.getInstanceMethod('handle')
  const body = handle?.getBody()
  const [contextParameter] = handle?.getParameters() ?? []

  if (
    body?.getKindName() !== 'Block' ||
    contextParameter?.getNameNode().getKindName() !== 'Identifier'
  ) {
    return 'unsupported' as const
  }

  const block = body as Block
  const contextName = contextParameter.getName()
  const exclusionExpression = `${contextName}.request.url() !== '${MCP_REQUEST_PATH}'`
  const alreadyExcluded = block.getStatements().some((statement) => {
    if (statement.getKindName() !== 'IfStatement') return false

    const ifStatement = statement as IfStatement

    return (
      ifStatement.getExpression().getText() === exclusionExpression &&
      ifStatement
        .getThenStatement()
        .getText()
        .includes(`${contextName}.request.request.headers.accept`)
    )
  })

  if (alreadyExcluded) return 'already_configured' as const

  const forceJsonStatement = block.getStatements().find((statement) => {
    if (statement.getKindName() !== 'ExpressionStatement') return false

    const expression = (statement as ExpressionStatement).getExpression()
    if (expression.getKindName() !== 'BinaryExpression') return false

    const assignment = expression as BinaryExpression
    if (assignment.getOperatorToken().getText() !== '=') return false

    const value = assignment.getRight().getText()

    return (
      assignment.getLeft().getText() === `${contextName}.request.request.headers.accept` &&
      (value === "'application/json'" || value === '"application/json"')
    )
  })

  if (!forceJsonStatement) return 'unsupported' as const

  forceJsonStatement.replaceWithText(
    `if (${contextName}.request.url() !== '${MCP_REQUEST_PATH}') {\n  ${forceJsonStatement.getText()}\n}`
  )

  return 'updated' as const
}

async function registerRoute(
  command: Configure,
  codemods: Awaited<ReturnType<Configure['createCodemods']>>
) {
  const project = await codemods.getTsMorphProject()
  const routesFile = project?.getSourceFile(command.app.startPath('routes.ts'))

  if (!routesFile) {
    command.logger.warning('could not read start/routes.ts, add the MCP route yourself')
    return
  }

  useAdonisFormatting(routesFile)
  const importAdded = addMiddlewareImport(routesFile)

  if (routesFile.getFullText().includes('mcps_controller')) {
    if (importAdded) await routesFile.save()
    command.logger.info('skipped  the MCP route is already registered')
    return
  }

  routesFile.addStatements(MCP_ROUTE)
  await routesFile.save()

  command.logger.action('update start/routes.ts').succeeded()
}

export function addMiddlewareImport(sourceFile: SourceFile) {
  const kernelImport = sourceFile.getImportDeclaration(
    (declaration) => declaration.getModuleSpecifierValue() === '#start/kernel'
  )

  if (kernelImport) {
    if (
      kernelImport.getNamedImports().some((namedImport) => namedImport.getName() === 'middleware')
    ) {
      return false
    }

    kernelImport.addNamedImport('middleware')
    return true
  }

  const lastImport = sourceFile.getImportDeclarations().at(-1)
  sourceFile.insertStatements(
    lastImport ? lastImport.getChildIndex() + 1 : 0,
    "import { middleware } from '#start/kernel'"
  )
  return true
}

function useAdonisFormatting(sourceFile: SourceFile) {
  sourceFile.getProject().manipulationSettings.set({
    indentationText: '  ' as IndentationText,
    useTrailingCommas: true,
  })
}
