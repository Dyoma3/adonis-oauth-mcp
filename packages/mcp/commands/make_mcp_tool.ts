import { dirname, relative } from 'node:path'
import { BaseCommand, args } from '@adonisjs/core/ace'
import string from '@adonisjs/core/helpers/string'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { ArrayLiteralExpression, SourceFile } from 'ts-morph'
import { stubsRoot } from '../stubs/main.js'

/**
 * Scaffolds a tool under app/mcp/tools and adds it to the explicit registry in
 * app/mcp/tools/main.ts, so the file created is actually served.
 */
export default class MakeMcpTool extends BaseCommand {
  static commandName = 'make:mcp-tool'
  static description = 'Create a new MCP tool'
  static options: CommandOptions = { allowUnknownFlags: true }

  @args.string({ description: 'Name of the MCP tool' })
  declare name: string

  async run() {
    const codemods = await this.createCodemods()
    const entity = this.app.generators.createEntity(this.name)
    const qualifiedName = entity.path === './' ? entity.name : `${entity.path}/${entity.name}`

    const toolName = string.snakeCase(qualifiedName)
    const factoryName = string.camelCase(`${toolName}_tool`)
    const fileName = `${string.snakeCase(entity.name)}.ts`
    const expectedDestination = this.app.makePath('app/mcp/tools', entity.path, fileName)

    if (entity.path === './' && fileName === 'main.ts') {
      this.logger.error('"main" is reserved for the MCP tools registry')
      this.exitCode = 1
      return
    }

    const { destination } = await codemods.makeUsingStub(stubsRoot, 'make/mcp_tool/main.stub', {
      entity,
      toolName,
      factoryName,
      fileName,
      toolTitle: string.capitalCase(qualifiedName.replaceAll('/', ' ')),
    })

    await this.registerTool(codemods, factoryName, destination ?? expectedDestination)
  }

  private async registerTool(
    codemods: Awaited<ReturnType<BaseCommand['createCodemods']>>,
    factoryName: string,
    destination: string
  ) {
    const project = await codemods.getTsMorphProject()
    const registryPath = this.app.makePath('app/mcp/tools/main.ts')
    const registryFile = project?.getSourceFile(registryPath)

    if (!registryFile) {
      this.logger.warning(`add "${factoryName}" to the tools in app/mcp/tools/main.ts`)
      return
    }

    const result = addToolToRegistry(registryFile, factoryName, destination)

    if (result === 'unsupported') {
      this.logger.warning(`add "${factoryName}" to the tools in app/mcp/tools/main.ts`)
      return
    }

    if (result === 'already_registered') return

    await registryFile.save()

    this.logger.action('update app/mcp/tools/main.ts').succeeded()
  }
}

export function addToolToRegistry(
  registryFile: SourceFile,
  factoryName: string,
  destination: string
) {
  const toolsInitializer = registryFile.getVariableDeclaration('tools')?.getInitializer()
  const tools =
    toolsInitializer?.getKindName() === 'ArrayLiteralExpression'
      ? (toolsInitializer as ArrayLiteralExpression)
      : undefined

  if (!tools) return 'unsupported' as const

  let updated = false
  const alreadyImported = registryFile.getImportDeclarations().some((declaration) => {
    return declaration.getNamedImports().some((named) => named.getName() === factoryName)
  })
  const alreadyRegistered = tools.getElements().some((element) => element.getText() === factoryName)

  if (!alreadyRegistered) {
    tools.addElement(factoryName)
    updated = true
  }

  if (!alreadyImported) {
    const relativePath = relative(dirname(registryFile.getFilePath()), destination)
      .replaceAll('\\', '/')
      .replace(/\.ts$/, '.js')
    const moduleSpecifier = relativePath.startsWith('.') ? relativePath : `./${relativePath}`
    const lastImport = registryFile.getImportDeclarations().at(-1)

    registryFile.insertStatements(
      lastImport ? lastImport.getChildIndex() + 1 : 0,
      `import { ${factoryName} } from '${moduleSpecifier}'`
    )
    updated = true
  }

  return updated ? ('updated' as const) : ('already_registered' as const)
}
