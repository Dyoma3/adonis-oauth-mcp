/**
 * The stub engine (tempura) compiles a stub into a template literal, so any
 * backtick or interpolation the generated file needs must be escaped in the
 * stub. These tests render every stub the way `node ace configure` does, to
 * catch a stub that no longer compiles or no longer lands where it should.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Application } from '@adonisjs/core/app'
import { stubsRoot } from '../build/stubs/main.js'

async function render(stubPath, state = {}) {
  const appRoot = await mkdtemp(join(tmpdir(), 'adonis-oauth-'))
  const app = new Application(pathToFileURL(`${appRoot}/`), {
    importer: (filePath) => import(filePath),
    environment: 'console',
  })

  await app.init()

  const stubs = await app.stubs.create()
  const stub = await stubs.build(stubPath, { source: stubsRoot })
  const result = await stub.generate({ ...state, flags: {} })
  const contents = await readFile(result.destination, 'utf-8')

  await rm(appRoot, { recursive: true, force: true })

  return { ...result, contents, appRoot }
}

test('renders config/oauth.ts with its template literals intact', async () => {
  const { destination, appRoot, contents } = await render('config/oauth.stub')

  assert.equal(destination, join(appRoot, 'config/oauth.ts'))
  assert.match(contents, /resource: `\$\{env\.get\('APP_URL'\)\}\/mcp`/)
  assert.match(contents, /name: `oauth:\$\{client\.id\}`/)
  assert.match(contents, /export default defineConfig\(\{/)
})

test('renders the authorization codes migration', async () => {
  const { destination, contents } = await render('migration.stub', {
    migration: { prefix: 1800000000000, tableName: 'oauth_authorization_codes' },
  })

  assert.match(destination, /1800000000000_create_oauth_authorization_codes_table\.ts$/)
  assert.match(contents, /protected tableName = 'oauth_authorization_codes'/)
  assert.match(contents, /table\.string\('code_hash', 64\)\.notNullable\(\)\.unique\(\)/)
})

test('renders the controller with its decorators', async () => {
  const { destination, appRoot, contents } = await render('controllers/oauth_controller.stub')

  assert.equal(destination, join(appRoot, 'app/controllers/oauth_controller.ts'))
  assert.equal(contents.match(/@inject\(\)/g).length, 5)
  assert.match(contents, /export default class OauthController \{/)
})
