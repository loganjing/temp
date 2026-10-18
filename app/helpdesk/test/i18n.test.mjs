import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { withHttpServer } from './with-http-server.mjs'

test('selected i18n module resolves request locale on a real HTTP route', async () => {
  const app = createApp({ registerProtectedRoutes: (routes) => routes.get('/api/locale', (c) => c.json({ locale: c.get('locale') })) })
  await withHttpServer(app, async (url) => {
    const response = await fetch(`${url}/api/locale`, { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { locale: 'zh' })
  })
})
