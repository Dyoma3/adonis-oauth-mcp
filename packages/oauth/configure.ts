import { readdir } from 'node:fs/promises'
import type Configure from '@adonisjs/core/commands/configure'
import { stubsRoot } from './stubs/main.js'

const MIGRATION_SUFFIX = '_create_oauth_authorization_codes_table.ts'

/**
 * Configure hook, run by `node ace configure @dinko/adonis-oauth`.
 *
 * Existing files are never overwritten: stubs are skipped when their target
 * already exists. Routes are not registered automatically, since where they
 * live and which middleware protects them is the application's decision; the
 * generated controller documents the ones to add.
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
  })
}

async function hasAuthorizationCodesMigration(command: Configure) {
  try {
    const files = await readdir(command.app.makePath('database/migrations'))
    return files.some((file) => file.endsWith(MIGRATION_SUFFIX))
  } catch {
    return false
  }
}
