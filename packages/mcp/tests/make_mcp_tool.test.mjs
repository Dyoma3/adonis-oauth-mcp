import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IndentationText, Project, QuoteKind } from 'ts-morph'
import { addToolToRegistry } from '../build/commands/make_mcp_tool.js'

function createRegistry() {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
    },
  })

  return project.createSourceFile(
    '/app/app/mcp/tools/main.ts',
    [
      "import type { McpToolFactory } from '@dinko/adonis-mcp/types'",
      '',
      'export const tools: McpToolFactory[] = []',
    ].join('\n')
  )
}

test('registers root and nested tools in app/mcp/tools/main.ts', () => {
  const registry = createRegistry()

  assert.equal(
    addToolToRegistry(registry, 'getSkillTool', '/app/app/mcp/tools/get_skill.ts'),
    'updated'
  )
  assert.equal(
    addToolToRegistry(registry, 'skillsGetTool', '/app/app/mcp/tools/skills/get.ts'),
    'updated'
  )

  assert.match(registry.getFullText(), /import \{ getSkillTool \} from '\.\/get_skill\.js'/)
  assert.match(registry.getFullText(), /import \{ skillsGetTool \} from '\.\/skills\/get\.js'/)
  assert.match(registry.getFullText(), /\[getSkillTool, skillsGetTool\]/)
})

test('does not duplicate an already registered tool', () => {
  const registry = createRegistry()

  addToolToRegistry(registry, 'getSkillTool', '/app/app/mcp/tools/get_skill.ts')
  const firstResult = registry.getFullText()

  assert.equal(
    addToolToRegistry(registry, 'getSkillTool', '/app/app/mcp/tools/get_skill.ts'),
    'already_registered'
  )
  assert.equal(registry.getFullText(), firstResult)
})

test('leaves a custom registry shape untouched', () => {
  const registry = createRegistry()
  registry.getVariableDeclarationOrThrow('tools').setInitializer('loadTools()')

  assert.equal(
    addToolToRegistry(registry, 'getSkillTool', '/app/app/mcp/tools/get_skill.ts'),
    'unsupported'
  )
  assert.doesNotMatch(registry.getFullText(), /getSkillTool/)
})
