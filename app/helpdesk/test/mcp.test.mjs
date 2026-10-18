// MCP 端点测试：本地 http 服务器模拟 Lingee Console（code 交换 / userinfo /
// 附件文件下载），验证 JSON-RPC 协议、x-lingee-code 认证、create_ticket
// 幂等与附件尽力而为语义（契约 §13）。
import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import { jsonCall, loginAs, seedBizUser, seedScenario, withIsolatedPlatform } from './api-helpers.mjs'

function startConsoleMock() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if (req.method === 'POST' && url.pathname === '/console/api/open/auth/token/exchange') {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        const { code } = JSON.parse(raw)
        if (code === 'bad-code') {
          json(401, { code: 401, message: 'invalid code' })
          return
        }
        json(200, {
          code: 0,
          data: {
            sysUserId: 'sys-mcp-user',
            tenantId: 100,
            accessToken: `tok-${code}`,
            refreshToken: `refresh-${code}`,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        })
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/console/api/open/auth/token/userinfo') {
      json(200, {
        code: 0,
        data: { tenantCode: 'default', tenantId: 100, username: 'mcp-agent', truename: '灵基智能体', email: 'mcp@corp.test' },
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/files/hello.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('hello-mcp')
      return
    }
    json(404, { code: 404, message: 'not found' })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      })
    })
  })
}

let rpcId = 0
async function mcpCall(app, method, params, code) {
  rpcId += 1
  const headers = {}
  const finalCode = code === undefined ? `mcp-code-${rpcId}` : code
  if (finalCode !== null) headers['x-lingee-code'] = finalCode
  return jsonCall(app, 'POST', '/api/mcp', { body: { jsonrpc: '2.0', id: rpcId, method, params }, headers })
}

const toolResultOf = (response) => JSON.parse(response.json.result.content[0].text)

test('initialize 与 tools/list：返回协议版本与 create_ticket 工具定义', async () => {
  const mock = await startConsoleMock()
  try {
    await withIsolatedPlatform({ env: { LINGEE_CONSOLE_URL: mock.url, MATCH_FIELDS: 'email:email' } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      await seedBizUser(platform.db, { id: 9, email: 'mcp@corp.test', nameZh: '灵基用户', role: 'requester' })

      const init = await mcpCall(app, 'initialize', { protocolVersion: '2024-11-05' })
      assert.equal(init.status, 200)
      assert.equal(init.json.jsonrpc, '2.0')
      assert.equal(init.json.result.protocolVersion, '2024-11-05')
      assert.equal(init.json.result.serverInfo.name, 'helpdesk-mcp')
      assert.equal(init.json.result.serverInfo.version, '1.0.0')

      const tools = await mcpCall(app, 'tools/list', {})
      assert.equal(tools.status, 200)
      assert.equal(tools.json.result.tools.length, 1)
      assert.equal(tools.json.result.tools[0].name, 'create_ticket')
      assert.deepEqual(tools.json.result.tools[0].inputSchema.required, [
        'subjectZh',
        'description',
        'categoryId',
        'priority',
        'idempotencyKey',
      ])
    })
  } finally {
    await mock.close()
  }
})

test('认证失败：缺 x-lingee-code 与无效 code 都返回 401 AUTH_REQUIRED', async () => {
  const mock = await startConsoleMock()
  try {
    await withIsolatedPlatform({ env: { LINGEE_CONSOLE_URL: mock.url, MATCH_FIELDS: 'email:email' } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      await seedBizUser(platform.db, { id: 9, email: 'mcp@corp.test', nameZh: '灵基用户', role: 'requester' })

      const noHeader = await mcpCall(app, 'initialize', {}, null)
      assert.equal(noHeader.status, 401)
      assert.equal(noHeader.json.error.code, 'AUTH_REQUIRED')

      const badCode = await mcpCall(app, 'initialize', {}, 'bad-code')
      assert.equal(badCode.status, 401)
      assert.equal(badCode.json.error.code, 'AUTH_REQUIRED')
    })
  } finally {
    await mock.close()
  }
})

test('tools/call create_ticket：创建工单、同幂等键重放返回同一单、提交人 Bearer 可查详情', async () => {
  const mock = await startConsoleMock()
  try {
    await withIsolatedPlatform({ env: { LINGEE_CONSOLE_URL: mock.url, MATCH_FIELDS: 'email:email' } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      await seedBizUser(platform.db, { id: 9, email: 'mcp@corp.test', nameZh: '灵基用户', role: 'requester' })

      const args = {
        subjectZh: 'MCP 网络工单',
        description: '智能体代为提交',
        categoryId: 40,
        priority: 'high',
        idempotencyKey: 'mcp-create-1',
      }
      const first = await mcpCall(app, 'tools/call', { name: 'create_ticket', arguments: args })
      assert.equal(first.status, 200)
      const created = toolResultOf(first)
      assert.equal(created.status, 'assigned')
      assert.equal(created.assignment.result, 'assigned')
      assert.equal(created.assignment.assignee.id, 3)
      assert.match(created.ticketNo, /^HD-\d{8}-\d{4}$/)

      const second = await mcpCall(app, 'tools/call', { name: 'create_ticket', arguments: args })
      assert.equal(second.status, 200)
      const replayed = toolResultOf(second)
      assert.equal(replayed.id, created.id)
      assert.equal(replayed.ticketNo, created.ticketNo)

      const token = await loginAs(app, 'mcp@corp.test')
      const detail = await jsonCall(app, 'GET', `/api/tickets/${created.id}`, { token })
      assert.equal(detail.status, 200)
      assert.equal(detail.json.requester.id, 9)
      assert.equal(detail.json.status, 'assigned')
    })
  } finally {
    await mock.close()
  }
})

test('错误映射：未知方法 -32601、未知工具与参数校验 -32602、非法 JSON-RPC -32600', async () => {
  const mock = await startConsoleMock()
  try {
    await withIsolatedPlatform({ env: { LINGEE_CONSOLE_URL: mock.url, MATCH_FIELDS: 'email:email' } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      await seedBizUser(platform.db, { id: 9, email: 'mcp@corp.test', nameZh: '灵基用户', role: 'requester' })

      const unknownMethod = await mcpCall(app, 'unknown_method', {})
      assert.equal(unknownMethod.status, 200)
      assert.equal(unknownMethod.json.error.code, -32601)

      const unknownTool = await mcpCall(app, 'tools/call', { name: 'other_tool', arguments: {} })
      assert.equal(unknownTool.json.error.code, -32602)
      assert.match(unknownTool.json.error.message, /other_tool/)

      const missingKey = await mcpCall(app, 'tools/call', {
        name: 'create_ticket',
        arguments: { subjectZh: 'x', description: 'y', categoryId: 40, priority: 'low' },
      })
      assert.equal(missingKey.json.error.code, -32602)
      assert.equal(missingKey.json.error.data.code, 'VALIDATION')
      assert.deepEqual(missingKey.json.error.data.details.fields, ['idempotencyKey'])

      const badCategory = await mcpCall(app, 'tools/call', {
        name: 'create_ticket',
        arguments: { subjectZh: 'x', description: 'y', categoryId: 9999, priority: 'low', idempotencyKey: 'mcp-bad-cat' },
      })
      assert.equal(badCategory.json.error.code, -32602)
      assert.equal(badCategory.json.error.data.code, 'VALIDATION')
      assert.deepEqual(badCategory.json.error.data.details.fields, ['categoryId'])

      const badRpc = await jsonCall(app, 'POST', '/api/mcp', {
        body: { jsonrpc: '1.0', id: 999, method: 'initialize' },
        headers: { 'x-lingee-code': 'mcp-code-bad-rpc' },
      })
      assert.equal(badRpc.status, 200)
      assert.equal(badRpc.json.error.code, -32600)

      const nonObjectBody = await jsonCall(app, 'POST', '/api/mcp', {
        body: 'plain text',
        headers: { 'x-lingee-code': 'mcp-code-non-object' },
      })
      assert.equal(nonObjectBody.status, 200)
      assert.equal(nonObjectBody.json.error.code, -32600)
      assert.equal(nonObjectBody.json.id, null)
    })
  } finally {
    await mock.close()
  }
})

test('attachmentUrl：成功下载挂接到工单，下载失败仅记录活动不阻断创建', async () => {
  const mock = await startConsoleMock()
  try {
    await withIsolatedPlatform({ env: { LINGEE_CONSOLE_URL: mock.url, MATCH_FIELDS: 'email:email' } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      await seedBizUser(platform.db, { id: 9, email: 'mcp@corp.test', nameZh: '灵基用户', role: 'requester' })

      const ok = await mcpCall(app, 'tools/call', {
        name: 'create_ticket',
        arguments: {
          subjectZh: '带附件工单',
          description: '智能体代提并带附件',
          categoryId: 40,
          priority: 'medium',
          idempotencyKey: 'mcp-attach-1',
          attachmentUrl: `${mock.url}/files/hello.txt`,
        },
      })
      assert.equal(ok.status, 200)
      const ticket = toolResultOf(ok)

      const rows = await platform.db.queryAll({
        text: 'SELECT id, name, source FROM attachments WHERE entity_id = ?',
        params: [`ticket-${ticket.id}`],
      })
      assert.equal(rows.length, 1)
      assert.equal(rows[0].name, 'hello.txt')
      assert.equal(rows[0].source, 'mcp-download')

      const token = await loginAs(app, 'mcp@corp.test')
      const download = await jsonCall(app, 'GET', `/api/attachments/${rows[0].id}/download`, { token })
      assert.equal(download.status, 200)
      assert.equal(download.text, 'hello-mcp')

      const failed = await mcpCall(app, 'tools/call', {
        name: 'create_ticket',
        arguments: {
          subjectZh: '附件失败工单',
          description: '智能体代提，附件不可达',
          categoryId: 40,
          priority: 'medium',
          idempotencyKey: 'mcp-attach-2',
          attachmentUrl: 'http://127.0.0.1:1/nope.txt',
        },
      })
      assert.equal(failed.status, 200)
      const failedTicket = toolResultOf(failed)
      assert.ok(failedTicket.id > 0)

      const activities = await jsonCall(app, 'GET', `/api/tickets/${failedTicket.id}/activities`, { token })
      assert.ok(activities.json.items.some((item) => item.action === 'mcp_attachment_failed' && item.source === 'mcp'))
    })
  } finally {
    await mock.close()
  }
})
