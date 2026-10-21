import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { createAuthBoundary } from '../src/server/platform/auth.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'

const directory = await mkdtemp(path.join(tmpdir(), 'ticket-auth-'))
process.env.DB_PATH = path.join(directory, 'application.db')
const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: createAuthBoundary(platform.db),
})

after(async () => {
  await platform.close()
  await rm(directory, { recursive: true, force: true })
})

async function login(username, password) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

test('login issues a bearer session and /me reads the user summary', async () => {
  const response = await login('alice', 'Demo@1234')
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.match(data.token, /^[0-9a-f]{64}$/)
  assert.deepEqual(data.user, {
    id: 1,
    username: 'alice',
    fullName: '张丽',
    email: 'alice@example-tech.cn',
    companyId: 1,
    companyName: '示例科技有限公司',
    department: '产品部',
  })

  const me = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${data.token}` } })
  assert.equal(me.status, 200)
  assert.deepEqual(await me.json(), data.user)
})

test('login rejects wrong credentials with one unified message', async () => {
  for (const payload of [
    { username: 'alice', password: 'wrong-password' },
    { username: 'nobody', password: 'Demo@1234' },
  ]) {
    const response = await login(payload.username, payload.password)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: { code: 'UNAUTHENTICATED', message: '用户名或密码错误' } })
  }
})

test('protected endpoints reject missing or unknown tokens with 401', async () => {
  const missing = await app.request('/api/auth/me')
  assert.equal(missing.status, 401)
  assert.deepEqual(await missing.json(), { error: { code: 'UNAUTHENTICATED', message: '未认证或会话过期' } })

  const malformed = await app.request('/api/auth/me', { headers: { authorization: 'Bearer not-a-token' } })
  assert.equal(malformed.status, 401)

  const unknown = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${'a'.repeat(64)}` } })
  assert.equal(unknown.status, 401)
})

test('logout revokes the current session token', async () => {
  const response = await login('bob', 'Demo@1234')
  const { token } = await response.json()

  const logout = await app.request('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  assert.equal(logout.status, 204)

  const me = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } })
  assert.equal(me.status, 401)
})
