import { readdir } from 'node:fs/promises'
import type Configure from '@adonisjs/core/commands/configure'
import { stubsRoot } from './stubs/main.js'

const MIGRATION_SUFFIX = '_create_oauth_authorization_codes_table.ts'

const OAUTH_ROUTES = `
/*
|--------------------------------------------------------------------------
| OAuth
|--------------------------------------------------------------------------
|
| Approve and deny must run behind your authentication middleware: the
| authorization code is bound to the user granting access, so the endpoint
| needs to know who that is.
|
| The token endpoint is public, as the specification requires, and is where
| authorization codes are redeemed, which makes it a good place for a
| throttle. The two discovery endpoints are public and take no middleware.
|
| The consent screen itself is yours to serve, at the URL you advertise as
| authorizationEndpoint in config/oauth.ts.
|
*/
const OauthController = () => import('#controllers/oauth_controller')

router.get('.well-known/oauth-authorization-server', [OauthController, 'getAuthorizationServer'])
router.get('.well-known/oauth-protected-resource/:resource', [OauthController, 'getProtectedResource'])

router
  .group(() => {
    router.post('token', [OauthController, 'token'])

    router
      .group(() => {
        router.post('authorize/approve', [OauthController, 'approveAuthorization'])
        router.post('authorize/deny', [OauthController, 'denyAuthorization'])
      })
      .use([
        // your authentication middleware, for example middleware.auth()
      ])
  })
  .prefix('oauth')
`

/**
 * Configure hook, run by \`node ace configure @dinko/adonis-oauth\`.
 *
 * Existing files are never overwritten: stubs are skipped when their target
 * already exists, and the routes are only appended once.
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods()

  await codemods.makeUsingStub(stubsRoot, 'config/oauth.stub', {})
  await codemods.makeUsingStub(stubsRoot, 'controllers/oauth_controller.stub', {})

  /**
   * Migrations are named after the time they are created, so an existing one
   * would not be detected by its filename alone. Looking for it keeps a second
   * run of this command from creating a duplicate table.
   */
  if (await hasAuthorizationCodesMigration(command)) {
    command.logger.info('skipped  the authorization codes migration already exists')
  } else {
    await codemods.makeUsingStub(stubsRoot, 'migration.stub', {
      migration: {
        prefix: new Date().getTime(),
        tableName: 'oauth_authorization_codes',
      },
    })
  }

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@dinko/adonis-oauth/oauth_provider')
    rcFile.addCommand('@dinko/adonis-oauth/commands')
  })

  await registerRoutes(command, codemods)
}

async function hasAuthorizationCodesMigration(command: Configure) {
  try {
    const files = await readdir(command.app.makePath('database/migrations'))
    return files.some((file) => file.endsWith(MIGRATION_SUFFIX))
  } catch {
    return false
  }
}

/**
 * Appends the OAuth routes to start/routes.ts. They are written out rather
 * than documented because the endpoints and their paths are fixed by the
 * protocol; what is left to decide, the middleware, is marked in place.
 */
async function registerRoutes(
  command: Configure,
  codemods: Awaited<ReturnType<Configure['createCodemods']>>
) {
  const project = await codemods.getTsMorphProject()
  const routesFile = project?.getSourceFile(command.app.startPath('routes.ts'))

  if (!routesFile) {
    command.logger.warning('could not read start/routes.ts, add the OAuth routes yourself')
    return
  }

  if (routesFile.getFullText().includes('authorize/approve')) {
    command.logger.info('skipped  the OAuth routes are already registered')
    return
  }

  routesFile.addStatements(OAUTH_ROUTES)
  await routesFile.save()

  command.logger.action('update start/routes.ts').succeeded()
}
