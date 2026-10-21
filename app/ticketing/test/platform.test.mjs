import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { withHttpServer } from './with-http-server.mjs'

test('platform serves a real HTTP API and keeps unknown API paths out of the SPA', async () => {
  await withHttpServer(createApp(), async (url) => {
    const health = await fetch(`${url}/api/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, app: 'ticketing' })

    const missing = await fetch(`${url}/api/missing`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'API route not found' } })
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
