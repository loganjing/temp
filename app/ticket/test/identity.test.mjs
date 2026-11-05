import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { seedQaIdentity, withQaEnvironment } from './fixtures/qa-environment.mjs'

const createCompany = async (platform, companyId, code) => {
  await platform.db.run({
    text: 'INSERT OR IGNORE INTO companies (id, code, name, created_at) VALUES (?, ?, ?, ?)',
    params: [companyId, code, `${code} Company`, new Date().toISOString()],
  })
}

const assignCompanyRole = async (platform, { userId, companyId, role = 'company_admin' }) => {
  await platform.db.run({
    text: `INSERT INTO user_profiles (user_id, company_id, department, created_at, updated_at)
           VALUES (?, ?, 'QA', ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, updated_at = excluded.updated_at`,
    params: [userId, companyId, new Date().toISOString(), new Date().toISOString()],
  })
  await platform.permissions.assignRole(userId, role, { type: 'company', id: companyId })
}

test('identity fixture is isolated, admin routes are company-admin only, and temporary-password rejection survives auth middleware', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const companyId = `${qaRunId}-company`
      const fixture = await seedQaIdentity(platform, {
        qaRunId,
        companyId,
        assignRoles: async (instance, context) => {
          await createCompany(instance, context.companyId, qaRunId.toUpperCase())
          await assignCompanyRole(instance, context)
        },
      })
      const temporaryEmail = `temporary-${qaRunId}@example.test`
      const temporaryPassword = randomUUID()
      const replacementPassword = randomUUID()
      const temporaryUser = await platform.auth.userStore.create({
        name: `Temporary ${qaRunId}`,
        email: temporaryEmail,
        companyId,
        passwordChangeRequired: true,
      }, platform.auth.hashPassword(temporaryPassword))
      await assignCompanyRole(platform, { userId: temporaryUser.id, companyId, role: 'agent' })

      const app = createApp({
        registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
        registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
        protect: platform.auth.requireAppAuth,
      })

      await withHttpServer(app, async (url) => {
        const health = await fetch(`${url}/api/health`)
        assert.deepEqual(await health.json(), { ok: true, app: 'ticket', qaRunId })

        const unauthenticated = await fetch(`${url}/api/admin/users`)
        assert.equal(unauthenticated.status, 401)
        assert.deepEqual(await unauthenticated.json(), {
          error: { code: 'UNAUTHENTICATED', message: '登录已过期，请重新登录' },
        })
        const invalidToken = await fetch(`${url}/api/admin/users`, { headers: { authorization: 'Bearer invalid' } })
        assert.equal(invalidToken.status, 401)

        const readyLogin = await fetch(`${url}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: fixture.email, password: fixture.password }),
        })
        assert.equal(readyLogin.status, 200)
        const readyLoginBody = await readyLogin.json()
        assert.equal(readyLoginBody.user.companyId, companyId)
        assert.equal(readyLoginBody.user.department, 'QA')
        assert.deepEqual(readyLoginBody.user.roles, ['company_admin'])
        const readyToken = readyLoginBody.token
        const readyIdentity = await fetch(`${url}/api/me`, { headers: { authorization: `Bearer ${readyToken}` } })
        assert.equal(readyIdentity.status, 200)
        const resolvedReadyIdentity = await readyIdentity.json()
        assert.equal(resolvedReadyIdentity.companyId, companyId)
        assert.equal(resolvedReadyIdentity.passwordChangeRequired, false)

        const otherCompanyUser = await platform.auth.userStore.create({
          name: `Other ${qaRunId}`,
          email: `other-${qaRunId}@example.test`,
          passwordChangeRequired: false,
        }, platform.auth.hashPassword(randomUUID()))
        await createCompany(platform, `${qaRunId}-other`, `${qaRunId}-OTHER`)
        await assignCompanyRole(platform, { userId: otherCompanyUser.id, companyId: `${qaRunId}-other`, role: 'agent' })

        const crossCompany = await fetch(`${url}/api/admin/users/${otherCompanyUser.id}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${readyToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Denied', email: `denied-${qaRunId}@example.test` }),
        })
        assert.equal(crossCompany.status, 403)

        const updatedEmail = `updated-${qaRunId}@example.test`
        const userUpdate = await fetch(`${url}/api/admin/users/${fixture.id}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${readyToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Updated ${qaRunId}`, email: updatedEmail, phone: '+60123456789', department: '运营部' }),
        })
        assert.equal(userUpdate.status, 200)
        const updatedBody = await userUpdate.json()
        assert.equal(updatedBody.user.email, updatedEmail)
        assert.equal(updatedBody.user.department, '运营部')
        const updatedIdentity = await platform.auth.userStore.findById(fixture.id)
        assert.equal(updatedIdentity.name, `Updated ${qaRunId}`)
        assert.equal(updatedIdentity.email, updatedEmail)
        assert.equal(updatedIdentity.companyId, companyId)

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
        const afterChange = await fetch(`${url}/api/admin/users`, { headers: { authorization: `Bearer ${temporaryToken}` } })
        assert.equal(afterChange.status, 403)
        assert.equal((await afterChange.json()).error.code, 'FORBIDDEN')

        const resolved = await platform.auth.userResolver.findById(temporaryUser.id)
        assert.equal(resolved?.companyId, companyId)
      })
    } finally {
      await platform.close()
    }
  })
})