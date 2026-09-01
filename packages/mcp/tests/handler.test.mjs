import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.getMetadata ??= () => []

const { McpRequestHandler } = await import('../build/index.js')

test('ends a partially-written response after an MCP transport failure', () => {
  const rawResponse = createRawResponse({ headersSent: true })
  const handler = createHandler(rawResponse)

  handler.writeInternalError()

  assert.equal(rawResponse.endCalls.length, 1)
  assert.equal(rawResponse.endCalls[0], undefined)
})

test('writes a JSON-RPC 500 before response headers have been sent', () => {
  const rawResponse = createRawResponse()
  const handler = createHandler(rawResponse)

  handler.writeInternalError()

  assert.deepEqual(rawResponse.head, {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
  assert.deepEqual(JSON.parse(rawResponse.endCalls[0]), {
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
    id: null,
  })
})

test('does not write to an ended response', () => {
  const rawResponse = createRawResponse({
    headersSent: true,
    writableEnded: true,
  })
  const handler = createHandler(rawResponse)

  handler.writeInternalError()

  assert.equal(rawResponse.endCalls.length, 0)
})

function createHandler(rawResponse) {
  return new McpRequestHandler({ response: { response: rawResponse } }, {})
}

function createRawResponse(overrides = {}) {
  return {
    destroyed: false,
    headersSent: false,
    writableEnded: false,
    endCalls: [],
    head: undefined,
    writeHead(status, headers) {
      this.head = { status, headers }
      this.headersSent = true
    },
    end(body) {
      this.endCalls.push(body)
      this.writableEnded = true
    },
    ...overrides,
  }
}
