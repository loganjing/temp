// 冒烟脚本：种子幂等 + 真实 HTTP 下的完成通知 sent / failed / 重试成功。
// 运行于 app/ticket 目录：node test/smoke-notifications.mjs；使用临时库与空闲端口，结束时清理本轮数据库与进程。
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { createMailSink } from './fixtures/fake-smtp.mjs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const root = path.resolve(import.meta.dirname, '..')
const workDir = path.join(import.meta.dirname, '.smoke-work')
const seedDb = path.join(workDir, 'seed.db')
const notifyDb = path.join(workDir, 'notify.db')
const sinkFile = path.join(workDir, 'mail-sink.jsonl')
const results = []
const record = (name, detail) => { results.push({ name, detail }); console.log(`[smoke] ${name}: ${detail}`) }

const run = (args, env) => {
  const outcome = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' })
  return { code: outcome.status, stdout: outcome.stdout?.trim(), stderr: outcome.stderr?.trim() }
}

const TABLES = {
  companies: 'SELECT id, code, name FROM companies ORDER BY id',
  user_profiles: 'SELECT user_id, company_id, department FROM user_profiles ORDER BY user_id',
  ticket_categories: 'SELECT id, company_id, name, enabled, sort_order FROM ticket_categories ORDER BY id',
  business_groups: 'SELECT id, company_id, name, enabled FROM business_groups ORDER BY id',
  business_group_members: 'SELECT group_id, user_id, company_id FROM business_group_members ORDER BY group_id, user_id',
  assignment_rules: 'SELECT id, company_id, category_id, group_id, enabled FROM assignment_rules ORDER BY id',
  tickets: 'SELECT id, code, company_id, subject, priority, status, submitter_id, group_id, assignee_id FROM tickets ORDER BY id',
  ticket_replies: 'SELECT id, ticket_id, author_id, content FROM ticket_replies ORDER BY id',
  ticket_logs: 'SELECT id, ticket_id, action, actor_id, summary FROM ticket_logs ORDER BY id',
  ticket_ratings: 'SELECT id, ticket_id, score FROM ticket_ratings ORDER BY id',
  ticket_notifications: 'SELECT id, ticket_id, recipient_email, status, attempt FROM ticket_notifications ORDER BY id',
}

const snapshot = (file) => {
  const db = new Database(file, { readonly: true })
  try {
    return Object.fromEntries(Object.entries(TABLES).map(([table, sql]) => [table, db.prepare(sql).all()]))
  } finally {
    db.close()
  }
}

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    server.close(() => resolve(port))
  })
})

const api = async (base, pathname, { token, method = 'GET', body } = {}) => {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${base}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  return { status: response.status, body: payload }
}

const login = async (base, email, password) => {
  const response = await api(base, '/api/auth/login', { method: 'POST', body: { email, password } })
  assert.equal(response.status, 200, `login ${email} -> ${response.status}`)
  return response.body.token
}

const waitForHealth = async (base) => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('server did not become healthy')
}

const sinkLines = async () => (await readFile(sinkFile, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))

const PASSWORD = 'TicketDemo#2026'
let server
let sink
try {
  await mkdir(workDir, { recursive: true })

  // 1. 种子幂等：连续执行两次，业务数据完全一致。
  const seedEnv = { DB_PATH: seedDb }
  const first = run(['--import', 'tsx', 'src/server/seed.ts'], seedEnv)
  assert.equal(first.code, 0, `seed run 1 exit ${first.code}: ${first.stderr}`)
  const firstSnapshot = snapshot(seedDb)
  const second = run(['--import', 'tsx', 'src/server/seed.ts'], seedEnv)
  assert.equal(second.code, 0, `seed run 2 exit ${second.code}: ${second.stderr}`)
  const secondSnapshot = snapshot(seedDb)
  for (const table of Object.keys(TABLES)) {
    assert.deepEqual(secondSnapshot[table], firstSnapshot[table], `seed run 2 changed ${table}`)
  }
  record('seed-idempotent', `runs=2 identical tables=${Object.keys(TABLES).length} output1=${first.stdout} output2=${second.stdout}`)

  // 2. 架构基线 1.3 演示口径。
  const counts = Object.fromEntries(Object.entries(firstSnapshot).map(([table, rows]) => [table, rows.length]))
  const departments = new Set(firstSnapshot.user_profiles.map((row) => row.department))
  const statuses = new Set(firstSnapshot.tickets.map((row) => row.status))
  assert.equal(counts.companies, 2, 'two demo companies')
  assert.equal(counts.user_profiles, 9, 'nine demo accounts')
  assert.ok(departments.size >= 4, `departments >= 4, got ${[...departments].join(',')}`)
  assert.equal(counts.business_groups, 3, 'three business groups')
  assert.ok(counts.business_group_members >= 3, 'group members seeded')
  assert.equal(counts.ticket_categories, 5, 'five categories')
  assert.ok(counts.assignment_rules >= 2, 'assignment rules seeded')
  assert.equal(counts.tickets, 8, 'eight demo tickets')
  assert.equal(counts.ticket_ratings, 3, 'three ratings')
  assert.ok(statuses.has('pending') && statuses.has('pending_assignment') && statuses.has('completed') && statuses.has('cancelled'), 'all demo statuses present')
  for (const company of firstSnapshot.companies) {
    assert.ok(firstSnapshot.ticket_categories.some((row) => row.company_id === company.id), `categories for ${company.code}`)
    assert.ok(firstSnapshot.business_groups.some((row) => row.company_id === company.id), `groups for ${company.code}`)
  }
  record('seed-demo-baseline', JSON.stringify({ counts, departments: [...departments].sort(), statuses: [...statuses].sort() }))

  // 3. 真实 HTTP + 本地 SMTP 桩：sent / failed / 重试成功。
  const seedNotify = run(['--import', 'tsx', 'src/server/seed.ts'], { DB_PATH: notifyDb })
  assert.equal(seedNotify.code, 0, `notify seed exit ${seedNotify.code}: ${seedNotify.stderr}`)
  sink = await createMailSink({ port: 0, file: sinkFile })
  const port = await freePort()
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: notifyDb,
      PORT: String(port),
      SMTP_HOST: sink.host,
      SMTP_PORT: String(sink.port),
      SMTP_SECURE: 'false',
      MAIL_FROM: 'noreply@example.test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const serverLogs = []
  server.stdout.on('data', (chunk) => serverLogs.push(chunk.toString()))
  server.stderr.on('data', (chunk) => serverLogs.push(chunk.toString()))
  const base = `http://127.0.0.1:${port}`
  try {
    await waitForHealth(base)

    const adminToken = await login(base, 'admin.acme@example.test', PASSWORD)
    const financeToken = await login(base, 'finance.acme@example.test', PASSWORD)
    const submitterToken = await login(base, 'user.acme@example.test', PASSWORD)
    const failToken = await login(base, 'fail@acme.example.test', PASSWORD)

    const reference = await api(base, '/api/reference', { token: submitterToken })
    assert.equal(reference.status, 200)
    const billing = reference.body.categories.find((category) => category.name === '账务问题')
    assert.ok(billing, '账务问题 category available')

    const createTicket = async (token, subject) => {
      const created = await api(base, '/api/tickets', {
        method: 'POST',
        token,
        body: { subject, description: '冒烟验证完成通知投递', categoryId: billing.id, priority: 'P2' },
      })
      assert.equal(created.status, 201, `create ticket -> ${created.status}`)
      assert.equal(created.body.ticket.status, 'pending', 'billing category must auto-assign to 财务支持组')
      return created.body.ticket
    }

    // 3a. 可达收件人：完成通知为 sent。
    const delivered = await createTicket(submitterToken, '冒烟-通知成功')
    const completedSent = await api(base, `/api/tickets/${delivered.id}/complete`, { method: 'POST', token: financeToken, body: { note: '已解决' } })
    assert.equal(completedSent.status, 200)
    assert.equal(completedSent.body.ticket.status, 'completed')
    assert.equal(completedSent.body.notification.status, 'sent')
    assert.equal(completedSent.body.notification.recipientEmail, 'user.acme@example.test')
    const sentMail = (await sinkLines()).find((mail) => mail.subject.includes(delivered.code))
    assert.ok(sentMail, `sink received ${delivered.code}`)
    assert.deepEqual(sentMail.to, ['user.acme@example.test'])
    record('notification-sent', JSON.stringify({ code: delivered.code, status: completedSent.body.notification.status, recipient: sentMail.to[0], subject: sentMail.subject }))

    // 3b. 550 收件人：通知 failed，工单仍为完成；重试后按最新邮箱投递成功。
    const undeliverable = await createTicket(failToken, '冒烟-通知失败')
    const completedFailed = await api(base, `/api/tickets/${undeliverable.id}/complete`, { method: 'POST', token: financeToken, body: { note: '已解决' } })
    assert.equal(completedFailed.status, 200)
    assert.equal(completedFailed.body.ticket.status, 'completed')
    assert.equal(completedFailed.body.notification.status, 'failed')
    assert.equal(completedFailed.body.notification.recipientEmail, 'fail@acme.example.test')
    assert.ok(completedFailed.body.notification.errorMessage, 'failed notification records an error message')
    const afterFailure = await api(base, `/api/tickets/${undeliverable.id}`, { token: failToken })
    assert.equal(afterFailure.status, 200)
    assert.equal(afterFailure.body.status, 'completed', 'failed notification must not change ticket status')
    record('notification-failed', JSON.stringify({ code: undeliverable.code, status: completedFailed.body.notification.status, error: completedFailed.body.notification.errorMessage, ticketStatus: afterFailure.body.status }))

    const retryStillFailing = await api(base, `/api/tickets/${undeliverable.id}/notifications/${completedFailed.body.notification.id}/retry`, { method: 'POST', token: financeToken })
    assert.equal(retryStillFailing.status, 200)
    assert.equal(retryStillFailing.body.notification.attempt, 2)
    assert.equal(retryStillFailing.body.notification.status, 'failed', 'unreachable address still fails')
    record('notification-retry-unreachable', JSON.stringify({ attempt: retryStillFailing.body.notification.attempt, status: retryStillFailing.body.notification.status }))

    const failUser = (await api(base, '/api/company-users', { token: adminToken })).body.items.find((user) => user.email === 'fail@acme.example.test')
    assert.ok(failUser, 'fail demo account listed')
    const correctedEmail = 'liuyang.acme@example.test'
    const fixed = await api(base, `/api/company-users/${failUser.id}`, { method: 'PATCH', token: adminToken, body: { department: failUser.department } })
    if (fixed.status !== 200) throw new Error(`company-users patch ${fixed.status}: ${JSON.stringify(fixed.body)} (department=${JSON.stringify(failUser.department)})`)
    const fixedEmail = await api(base, `/api/admin/users/${failUser.id}`, { method: 'PATCH', token: adminToken, body: { name: failUser.name, email: correctedEmail, department: failUser.department } })
    if (fixedEmail.status !== 200) throw new Error(`admin user patch ${fixedEmail.status}: ${JSON.stringify(fixedEmail.body)}`)
    const retried = await api(base, `/api/tickets/${undeliverable.id}/notifications/${completedFailed.body.notification.id}/retry`, { method: 'POST', token: financeToken })
    assert.equal(retried.status, 200)
    assert.equal(retried.body.notification.attempt, 3)
    assert.equal(retried.body.notification.status, 'sent')
    assert.equal(retried.body.notification.recipientEmail, correctedEmail)
    const correctedMail = (await sinkLines()).find((mail) => mail.to.includes(correctedEmail) && mail.subject.includes(undeliverable.code))
    assert.ok(correctedMail, 'sink received the corrected recipient')
    const finalDetail = await api(base, `/api/tickets/${undeliverable.id}`, { token: failToken })
    assert.equal(finalDetail.body.status, 'completed')
    const attempts = finalDetail.body.notifications.map((notification) => `${notification.attempt}:${notification.status}`).sort()
    assert.deepEqual(attempts, ['1:failed', '2:failed', '3:sent'])
    record('notification-retry-succeeded', JSON.stringify({ attempts, ticketStatus: finalDetail.body.status, recipient: correctedEmail }))

    console.log(`[smoke] results ${JSON.stringify(results)}`)
  } finally {
    if (server) {
      server.kill('SIGTERM')
      await new Promise((resolve) => server.once('exit', resolve))
      if (server.exitCode !== 0 && server.exitCode !== null) console.error(`[smoke] server exit ${server.exitCode}: ${serverLogs.join('')}`)
    }
    if (sink) await sink.close()
  }
} finally {
  await rm(workDir, { recursive: true, force: true })
}