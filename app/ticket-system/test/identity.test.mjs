import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { seedQaIdentity, withQaEnvironment } from './fixtures/qa-environment.mjs'

test('identity fixture is isolated and temporary-password rejection survives auth middleware', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const fixture = await seedQaIdentity(platform, { qaRunId })
      const temporaryEmail = `temporary-${qaRunId}@example.test`
      const temporaryPassword = randomUUID()
      const replacementPassword = randomUUID()
      const temporaryUser = await platform.auth.userStore.create({
        name: `Temporary ${qaRunId}`,
        email: temporaryEmail,
        companyId: fixture.companyId,
        passwordChangeRequired: true,
      }, platform.auth.hashPassword(temporaryPassword))
      const app = createApp({
        registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
        registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
        protect: platform.auth.requireAnyAuth,
      })

      await withHttpServer(app, async (url) => {
        const health = await fetch(`${url}/api/health`)
        assert.deepEqual(await health.json(), { ok: true, app: 'ticket-system', qaRunId })

        const unauthenticated = await fetch(`${url}/api/admin/users`)
        assert.equal(unauthenticated.status, 401)
        assert.deepEqual(await unauthenticated.json(), { error: 'Not authenticated' })
        const invalidToken = await fetch(`${url}/api/admin/users`, { headers: { authorization: 'Bearer invalid' } })
        assert.equal(invalidToken.status, 401)
        assert.deepEqual(await invalidToken.json(), { error: 'Session expired, please log in again' })

        const readyLogin = await fetch(`${url}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: fixture.email, password: fixture.password }),
        })
        assert.equal(readyLogin.status, 200)
        const readyLoginBody = await readyLogin.json()
        assert.equal(readyLoginBody.user.companyId, fixture.companyId)
        const readyToken = readyLoginBody.token
        const readyIdentity = await fetch(`${url}/api/auth/me`, { headers: { authorization: `Bearer ${readyToken}` } })
        assert.equal(readyIdentity.status, 200)
        const resolvedReadyIdentity = await readyIdentity.json()
        assert.equal(resolvedReadyIdentity.companyId, fixture.companyId)
        assert.equal(resolvedReadyIdentity.passwordChangeRequired, false)

        const updatedEmail = `updated-${qaRunId}@example.test`
        const userUpdate = await fetch(`${url}/api/admin/users/${fixture.id}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${readyToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Updated ${qaRunId}`, email: updatedEmail, phone: '+60123456789' }),
        })
        assert.equal(userUpdate.status, 200)
        assert.deepEqual((await userUpdate.json()).user, {
          id: fixture.id,
          name: `Updated ${qaRunId}`,
          email: updatedEmail,
          phone: '+60123456789',
        })
        const updatedIdentity = await platform.auth.userStore.findById(fixture.id)
        assert.equal(updatedIdentity.name, `Updated ${qaRunId}`)
        assert.equal(updatedIdentity.email, updatedEmail)
        assert.equal(updatedIdentity.phone, '+60123456789')
        assert.equal(updatedIdentity.companyId, fixture.companyId)

        const temporaryLogin = await fetch(`${url}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: temporaryEmail, password: temporaryPassword }),
        })
        assert.equal(temporaryLogin.status, 200)
        const temporaryToken = (await temporaryLogin.json()).token
        const blocked = await fetch(`${url}/api/admin/users`, { headers: { authorization: `Bearer ${temporaryToken}` } })
        assert.equal(blocked.status, 403)
        assert.deepEqual(await blocked.json(), {
          error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' },
        })

        const changed = await fetch(`${url}/api/auth/password`, {
          method: 'POST',
          headers: { authorization: `Bearer ${temporaryToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ password: replacementPassword }),
        })
        assert.equal(changed.status, 200)
        assert.equal((await changed.json()).passwordChangeRequired, false)
        assert.equal((await fetch(`${url}/api/admin/users`, { headers: { authorization: `Bearer ${temporaryToken}` } })).status, 200)

        const resolved = await platform.auth.userResolver.findById(temporaryUser.id)
        assert.equal(resolved?.companyId, fixture.companyId)
      })
    } finally {
      await platform.close()
    }
  })
})
