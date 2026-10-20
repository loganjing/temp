import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { authBoundary } from '../src/server/platform/auth.ts'
import { withHttpServer } from './with-http-server.mjs'

test('selected authkit protects business routes until a real UserResolver is connected', async () => {
  const app = createApp({
    protect: authBoundary,
    registerPublicRoutes: (routes) => routes.get('/api/public', (c) => c.json({ ok: true })),
    registerProtectedRoutes: (routes) => routes.get('/api/private', (c) => c.json({ ok: true })),
  })
  await withHttpServer(app, async (url) => {
    const publicResponse = await fetch(`${url}/api/public`)
    assert.equal(publicResponse.status, 200)
    const privateResponse = await fetch(`${url}/api/private`)
    assert.equal(privateResponse.status, 503)
    assert.equal((await privateResponse.json()).error.code, 'AUTH_NOT_CONFIGURED')
  })
})
