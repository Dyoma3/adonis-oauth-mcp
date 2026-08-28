import { relative } from 'node:path'
import { BaseCommand, args } from '@adonisjs/core/ace'
import { SyntaxKind } from 'ts-morph'
import string from '@adonisjs/core/helpers/string'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { stubsRoot } from '../stubs/main.js'

/**
 * Scaffolds a protected resource under app/oauth_resources, so each resource
 * keeps its clients and its token issuing in its own file instead of piling up
 * inside config/oauth.ts, and registers it there.
 */
export default class MakeOAuthResource extends BaseCommand {
  static commandName = 'make:oauth-resource'
  static description = 'Create a new OAuth protected resource'
  static options: CommandOptions = { allowUnknownFlags: true }

  @args.string({ description: 'Name of the OAuth resource' })
  declare name: string

  async run() {
    const codemods = await this.createCodemods()
    const entity = this.app.generators.createEntity(this.name)

    const fileName = `${string.snakeCase(entity.name)}_resource.ts`
    const variableName = string.camelCase(`${entity.name}_resource`)

    const { destination } = await codemods.makeUsingStub(
      stubsRoot,
      'make/oauth_resource/main.stub',
      {
        entity,
        fileName,
        variableName,
        resourceId: string.dashCase(entity.name),
        resourceName: string.capitalCase(entity.name),
      }
    )

    if (!destination) return

    await this.registerResource(codemods, variableName, destination)
  }

  /**
   * Imports the new resource in config/oauth.ts and adds it to the list, so
   * the file created is actually in use.
   */
  private async registerResource(
    codemods: Awaited<ReturnType<BaseCommand['createCodemods']>>,
    variableName: string,
    destination: string
  ) {
    const configPath = this.app.configPath('oauth.ts')
    const project = await codemods.getTsMorphProject()
    const configFile = project?.getSourceFile(configPath)

    if (!configFile) {
      this.logger.warning(`add "${variableName}" to the resources in config/oauth.ts`)
      return
    }

    const relativePath = relative(this.app.configPath(), destination)
      .replaceAll('\\', '/')
      .replace(/\.ts$/, '.js')
    const moduleSpecifier = relativePath.startsWith('.') ? relativePath : `./${relativePath}`

    const alreadyImported = configFile.getImportDeclarations().some((declaration) => {
      return declaration.getDefaultImport()?.getText() === variableName
    })

    if (alreadyImported) return

    /**
     * Written as text rather than through addImportDeclaration, which would
     * end the line with a semicolon the rest of the file does not use.
     */
    const lastImport = configFile.getImportDeclarations().at(-1)
    configFile.insertStatements(
      lastImport ? lastImport.getChildIndex() + 1 : 0,
      `import ${variableName} from '${moduleSpecifier}'`
    )

    const resources = configFile
      .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .find((property) => property.getName() === 'resources')
      ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression)

    if (!resources) {
      this.logger.warning(`add "${variableName}" to the resources in config/oauth.ts`)
      return
    }

    resources.addElement(variableName)
    await configFile.save()

    this.logger.action('update config/oauth.ts').succeeded()
  }
}
