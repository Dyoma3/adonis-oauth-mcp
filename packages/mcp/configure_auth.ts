import type Configure from '@adonisjs/core/commands/configure'
import type {
  IndentationText,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
} from 'ts-morph'

type Codemods = Awaited<ReturnType<Configure['createCodemods']>>

/**
 * Adds a guard dedicated to MCP, and the token provider it reads.
 *
 * MCP tokens are kept apart from the application's own API tokens by their
 * type, so revoking every MCP token, or auditing them, never touches the
 * others. They share the auth_access_tokens table, so no migration is needed.
 *
 * Both edits are best-effort: an application whose auth config or user model
 * does not have the shape we expect gets told what to add, and configuring
 * carries on.
 */
export async function registerAuthGuard(
  command: Configure,
  codemods: Codemods,
  guard: string,
  tokensProvider: string
) {
  const project = await codemods.getTsMorphProject()
  const configFile = project?.getSourceFile(command.app.configPath('auth.ts'))

  if (!configFile) return warnAboutGuard(command, guard, tokensProvider)

  useAdonisFormatting(configFile)
  const guardsProperty = findProperty(configFile, 'guards')
  const guardsInitializer = guardsProperty?.getInitializer()
  const guards =
    guardsInitializer?.getKindName() === 'ObjectLiteralExpression'
      ? (guardsInitializer as ObjectLiteralExpression)
      : undefined

  if (!guards) return warnAboutGuard(command, guard, tokensProvider)
  if (guards.getProperty(guard)) return

  addNamedImports(configFile, '@adonisjs/auth/access_tokens', ['tokensGuard', 'tokensUserProvider'])

  /**
   * Added as text, so the guard is written the way the rest of the file is
   * rather than the way the AST printer would.
   */
  guards.addProperty(
    [
      `${guard}: tokensGuard({`,
      `  provider: tokensUserProvider({`,
      `    tokens: '${tokensProvider}',`,
      `    model: () => import('#models/user'),`,
      `  }),`,
      `})`,
    ].join('\n')
  )

  await configFile.save()
  command.logger.action('update config/auth.ts').succeeded()
}

/**
 * Declares the token provider on the user model, typed by the guard's name so
 * MCP tokens are told apart from the rest.
 */
export async function registerTokenProvider(
  command: Configure,
  codemods: Codemods,
  tokensProvider: string,
  type: string
) {
  const project = await codemods.getTsMorphProject()
  const modelFile = project?.getSourceFile(command.app.modelsPath('user.ts'))
  const model = modelFile?.getClasses().find((candidate) => candidate.isDefaultExport())

  if (!modelFile || !model) return warnAboutTokenProvider(command, tokensProvider, type)

  useAdonisFormatting(modelFile)
  if (model.getStaticProperty(tokensProvider)) return

  addNamedImports(modelFile, '@adonisjs/auth/access_tokens', ['DbAccessTokensProvider'])

  model.addMember(
    `static ${tokensProvider} = DbAccessTokensProvider.forModel(${model.getName()}, { type: '${type}' })`
  )

  await modelFile.save()
  command.logger.action(`update ${command.app.relativePath(modelFile.getFilePath())}`).succeeded()
}

/**
 * Adds named imports to an existing import of the module, or creates one.
 */
function addNamedImports(file: SourceFile, moduleSpecifier: string, names: string[]) {
  const declaration = file.getImportDeclaration(
    (candidate) => candidate.getModuleSpecifierValue() === moduleSpecifier
  )

  if (!declaration) {
    const lastImport = file.getImportDeclarations().at(-1)
    file.insertStatements(
      lastImport ? lastImport.getChildIndex() + 1 : 0,
      `import { ${names.join(', ')} } from '${moduleSpecifier}'`
    )
    return
  }

  const existing = declaration.getNamedImports().map((named) => named.getName())
  const missing = names.filter((name) => !existing.includes(name))

  if (missing.length) declaration.addNamedImports(missing)
}

function warnAboutGuard(command: Configure, guard: string, tokensProvider: string) {
  command.logger.warning(`add a "${guard}" guard to config/auth.ts, reading "${tokensProvider}"`)
}

function warnAboutTokenProvider(command: Configure, tokensProvider: string, type: string) {
  command.logger.warning(
    `add "static ${tokensProvider} = DbAccessTokensProvider.forModel(User, { type: '${type}' })" to your user model`
  )
}

function findProperty(file: SourceFile, name: string) {
  return file.getDescendants().find((node) => {
    return (
      node.getKindName() === 'PropertyAssignment' && (node as PropertyAssignment).getName() === name
    )
  }) as PropertyAssignment | undefined
}

function useAdonisFormatting(sourceFile: SourceFile) {
  sourceFile.getProject().manipulationSettings.set({
    indentationText: '  ' as IndentationText,
    useTrailingCommas: true,
  })
}
