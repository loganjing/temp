import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import * as auth from '../src/server/platform/auth.ts'
import { withHttpServer } from './with-http-server.mjs'

test('platform serves a real HTTP API and keeps unknown API paths out of the SPA', async () => {
  await withHttpServer(createApp(), async (url) => {
    const health = await fetch(`${url}/api/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, app: 'jlg-ticket' })

    const missing = await fetch(`${url}/api/missing`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'API route not found' } })
  })
})

test('protected routes stay unavailable until an authentication boundary is configured', { skip: !('authBoundary' in auth) }, async () => {
  const app = createApp({
    protect: auth.authBoundary,
    registerPublicRoutes: (routes) => routes.get('/api/public', (c) => c.json({ ok: true })),
    registerProtectedRoutes: (routes) => routes.get('/api/private', (c) => c.json({ ok: true })),
  })
  await withHttpServer(app, async (url) => {
    assert.equal((await fetch(`${url}/api/public`)).status, 200)
    const response = await fetch(`${url}/api/private`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured' } })
  })
})

test('unexpected server errors do not expose their details', async () => {
  const app = createApp({ registerProtectedRoutes: (routes) => routes.get('/api/fail', () => {
    throw new Error('private detail')
  }) })
  await withHttpServer(app, async (url) => {
    const response = await fetch(`${url}/api/fail`)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  })
})
