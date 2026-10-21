// 测试辅助：临时数据库 + 迁移 + 幂等种子 + 组装真实 Hono 应用。
// 每次调用产生互相隔离的数据目录；测试文件在 node:test 独立进程中运行。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { runSeed, SEED_PASSWORD } from '../src/server/seed.ts'
import { withHttpServer } from './with-http-server.mjs'

const ENV_KEYS = ['DB_PATH', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_FROM_NAME', 'SMTP_USER', 'SMTP_PASS']

export { SEED_PASSWORD }

export const SEED_ACCOUNTS = {
  alice: 'alice@hongtu.example.com',
  bob: 'bob@hongtu.example.com',
  carol: 'carol@hongtu.example.com',
  grace: 'grace@hongtu.example.com',
  dave: 'dave@blueocean.example.com',
  erin: 'erin@blueocean.example.com',
}

/**
 * 在隔离数据库上启动种子化应用并执行 verify(url, platform)。
 * 传 options 选项 { smtp: { port, host } } 时启用本地 SMTP；省略时 SMTP_HOST 为空（外发禁用）。
 */
export async function withSeededApp(optionsOrVerify, maybeVerify) {
  const options = typeof optionsOrVerify === 'function' ? null : (optionsOrVerify ?? null)
  const verify = typeof optionsOrVerify === 'function' ? optionsOrVerify : maybeVerify
  const smtp = options?.smtp
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-system-'))
  const previous = {}
  for (const key of ENV_KEYS) previous[key] = process.env[key]
  process.env.DB_PATH = path.join(directory, 'application.db')
  if (smtp) {
    process.env.SMTP_HOST = smtp.host ?? '127.0.0.1'
    process.env.SMTP_PORT = String(smtp.port)
    process.env.SMTP_FROM = 'notify@ticket-system.local'
    process.env.SMTP_FROM_NAME = '工单系统'
  } else {
    process.env.SMTP_HOST = ''
  }
  try {
    const platform = await initializePlatform()
    await runSeed(platform)
    const app = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
      protect: platform.auth.requireAnyAuth,
    })
    return await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (url) => verify(url, platform))
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}

/** 契约 2.1 登录：username 即登录名（演示账号为邮箱）。 */
export async function login(url, username, password = SEED_PASSWORD) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return { response, body: await response.json() }
}

export const authHeaders = (token) => ({ authorization: `Bearer ${token}` })

export async function getJson(url, token, path) {
  const response = await fetch(`${url}${path}`, { headers: authHeaders(token) })
  return { response, body: await response.json() }
}

export async function postJson(url, token, path, payload = {}) {
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  })
  return { response, body: await response.json().catch(() => null) }
}

export async function putJson(url, token, path, payload) {
  const response = await fetch(`${url}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  })
  return { response, body: await response.json().catch(() => null) }
}

export async function deleteJson(url, token, path) {
  return fetch(`${url}${path}`, { method: 'DELETE', headers: authHeaders(token) })
}
