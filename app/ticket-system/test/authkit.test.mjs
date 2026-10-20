import assert from 'node:assert/strict'
import { test } from 'node:test'
import { api, login, seed, withTicketApp } from './app-fixture.mjs'

test('selected authkit boundary rejects requests without a valid token', async () => {
  await withTicketApp(async (url) => {
    const anonymous = await api(url, null, '/api/me')
    assert.equal(anonymous.status, 401)

    const invalidToken = await api(url, 'not-a-real-token', '/api/me')
    assert.equal(invalidToken.status, 401)

    const { response, body } = await login(url, seed.users.submitterA1)
    assert.equal(response.status, 200)
    assert.ok(body.token)
    assert.equal(body.user.role, 'submitter')
    assert.equal(body.user.companyId, seed.companies.a)

    const authenticated = await api(url, body.token, '/api/me')
    assert.equal(authenticated.status, 200)
    const me = await authenticated.json()
    assert.equal(me.id, seed.ids.submitterA1)
    assert.equal(me.companyName, '公司A')
    assert.equal(me.department, '研发部')
  })
})

test('login rejects bad credentials and disabled accounts with contract error codes', async () => {
  await withTicketApp(async (url) => {
    const wrongPassword = await login(url, seed.users.submitterA1, 'wrong-password')
    assert.equal(wrongPassword.response.status, 401)
    assert.deepEqual(wrongPassword.body, { error: 'invalid_credentials' })

    const unknownUser = await login(url, 'nobody@example.com', seed.password)
    assert.equal(unknownUser.response.status, 401)
    assert.deepEqual(unknownUser.body, { error: 'invalid_credentials' })

    const disabled = await login(url, seed.users.disabledA)
    assert.equal(disabled.response.status, 401)
    assert.deepEqual(disabled.body, { error: 'account_disabled' })

    const missingFields = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: seed.users.submitterA1 }),
    })
    assert.equal(missingFields.status, 400)
  })
})

test('login rate limit returns 429 after ten attempts in the window', async () => {
  await withTicketApp(async (url) => {
    for (let i = 0; i < 10; i++) {
      const { response } = await login(url, seed.users.submitterA1)
      assert.equal(response.status, 200)
    }
    const blocked = await login(url, seed.users.submitterA1)
    assert.equal(blocked.response.status, 429)
  })
})
