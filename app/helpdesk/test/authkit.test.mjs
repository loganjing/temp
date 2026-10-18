// authkit 集成：真实平台上的登录/会话/登出生命周期与账号停用边界。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADMIN_EMAIL, ADMIN_PASSWORD, SEED_PASSWORD, jsonCall, loginAs, seedBizUser, withIsolatedPlatform } from './api-helpers.mjs'

test('受保护路由在未携带 Bearer 时返回 401 AUTH_REQUIRED', async () => {
  await withIsolatedPlatform({}, async ({ app }) => {
    const response = await jsonCall(app, 'GET', '/api/tickets')
    assert.equal(response.status, 401)
    assert.equal(response.json.error.code, 'AUTH_REQUIRED')
  })
})

test('登录成功返回 token 与 UserRef，/api/auth/me 返回管理员档案', async () => {
  await withIsolatedPlatform({}, async ({ app }) => {
    const login = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
    assert.equal(login.status, 200)
    assert.equal(typeof login.json.token, 'string')
    assert.equal(login.json.user.id, 1)
    assert.equal(login.json.user.email, ADMIN_EMAIL)
    assert.equal(login.json.user.role, 'admin')
    assert.equal(login.json.user.displayName, '系统管理员')

    const me = await jsonCall(app, 'GET', '/api/auth/me', { token: login.json.token })
    assert.equal(me.status, 200)
    assert.equal(me.json.id, 1)
    assert.equal(me.json.email, ADMIN_EMAIL)
    assert.equal(me.json.role, 'admin')
    assert.equal(me.json.nameZh, '系统管理员')
    assert.equal(me.json.companyId, null)
  })
})

test('错误密码与不存在账号都返回 401 INVALID_CREDENTIALS', async () => {
  await withIsolatedPlatform({}, async ({ app }) => {
    const wrong = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: 'not-the-password' } })
    assert.equal(wrong.status, 401)
    assert.equal(wrong.json.error.code, 'INVALID_CREDENTIALS')
    const missing = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: 'ghost@helpdesk.local', password: 'whatever' } })
    assert.equal(missing.status, 401)
    assert.equal(missing.json.error.code, 'INVALID_CREDENTIALS')
    const empty = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: '', password: '' } })
    assert.equal(empty.status, 401)
    assert.equal(empty.json.error.code, 'INVALID_CREDENTIALS')
  })
})

test('logout 吊销 token，之后的请求回到 401', async () => {
  await withIsolatedPlatform({}, async ({ app }) => {
    const token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD)
    const before = await jsonCall(app, 'GET', '/api/auth/me', { token })
    assert.equal(before.status, 200)
    const logout = await jsonCall(app, 'POST', '/api/auth/logout', { token })
    assert.equal(logout.status, 204)
    const after = await jsonCall(app, 'GET', '/api/auth/me', { token })
    assert.equal(after.status, 401)
    assert.equal(after.json.error.code, 'AUTH_REQUIRED')
  })
})

test('业务账号停用后：登录 401 且既有 token 失效', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedBizUser(platform.db, { id: 2, email: 'staff@corp.test', nameZh: '员工', role: 'agent' })
    const token = await loginAs(app, 'staff@corp.test', SEED_PASSWORD)
    const active = await jsonCall(app, 'GET', '/api/auth/me', { token })
    assert.equal(active.status, 200)
    await platform.db.run({ text: 'UPDATE biz_users SET status = 0 WHERE id = 2' })
    await platform.db.run({ text: 'UPDATE users SET enabled = 0 WHERE id = (SELECT credential_user_id FROM biz_users WHERE id = 2)' })
    const login = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: 'staff@corp.test', password: SEED_PASSWORD } })
    assert.equal(login.status, 401)
    assert.equal(login.json.error.code, 'INVALID_CREDENTIALS')
    const stale = await jsonCall(app, 'GET', '/api/auth/me', { token })
    assert.equal(stale.status, 401)
  })
})

test('伪造 token 无法通过认证边界', async () => {
  await withIsolatedPlatform({}, async ({ app }) => {
    const forged = await jsonCall(app, 'GET', '/api/tickets', { token: 'not-a-real-token' })
    assert.equal(forged.status, 401)
    assert.equal(forged.json.error.code, 'AUTH_REQUIRED')
  })
})
