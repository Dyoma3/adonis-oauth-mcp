import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Project } from 'ts-morph'
import { addMcpExclusionToForceJsonMiddleware, addMiddlewareImport } from '../build/configure.js'

const middlewareSource = `
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class ForceJsonResponseMiddleware {
  handle(ctx: HttpContext, next: NextFn) {
    ctx.request.request.headers.accept = 'application/json'
    ctx.logger.debug('Content negotiation configured')
    return next()
  }
}
`

test('excludes MCP from the API starter kit JSON middleware', () => {
  const sourceFile = createSourceFile(middlewareSource)

  assert.equal(addMcpExclusionToForceJsonMiddleware(sourceFile), 'updated')
  assert.match(sourceFile.getFullText(), /if \(ctx\.request\.url\(\) !== '\/mcp'\) \{/)
  assert.match(
    sourceFile.getFullText(),
    /\}\s+ctx\.logger\.debug\('Content negotiation configured'\)\s+return next\(\)/
  )
  assert.match(
    sourceFile.getFullText(),
    /    if \(ctx\.request\.url\(\) !== '\/mcp'\) \{\n      ctx\.request\.request\.headers\.accept = 'application\/json'\n    \}/
  )
})

test('adds the middleware import to a fresh routes file only once', () => {
  const sourceFile = createSourceFile(
    "import router from '@adonisjs/core/services/router'\n\nrouter.get('/', () => 'ok')\n"
  )

  assert.equal(addMiddlewareImport(sourceFile), true)
  assert.equal(addMiddlewareImport(sourceFile), false)
  assert.equal(
    sourceFile.getFullText().match(/import \{ middleware \} from '#start\/kernel'/g)?.length,
    1
  )
})

test('does not duplicate an existing MCP exclusion', () => {
  const sourceFile = createSourceFile(middlewareSource)

  addMcpExclusionToForceJsonMiddleware(sourceFile)

  assert.equal(addMcpExclusionToForceJsonMiddleware(sourceFile), 'already_configured')
  assert.equal(sourceFile.getFullText().match(/request\.url\(\) !== '\/mcp'/g)?.length, 1)
})

test('leaves a custom JSON middleware unchanged', () => {
  const sourceFile = createSourceFile(`
export default class ForceJsonResponseMiddleware {
  handle(ctx, next) {
    ctx.response.header('Content-Type', 'application/json')
    return next()
  }
}
`)
  const original = sourceFile.getFullText()

  assert.equal(addMcpExclusionToForceJsonMiddleware(sourceFile), 'unsupported')
  assert.equal(sourceFile.getFullText(), original)
})

function createSourceFile(contents) {
  const project = new Project({ useInMemoryFileSystem: true })
  return project.createSourceFile('force_json_response_middleware.ts', contents)
}
