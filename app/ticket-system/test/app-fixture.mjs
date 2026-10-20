// 测试辅助：为业务集成测试启动隔离的真实 HTTP 应用（独立临时 SQLite + 种子数据）。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../src/server/app.ts'
import { createApplicationAuth } from '../src/server/platform/auth.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

// 种子数据常量（与 src/server/migrations/sqlite/0003_business_seed.sql 对应）。
export const seed = {
  password: 'Passw0rd!',
  users: {
    adminA: 'admin.a@example.com',
    handlerA1: 'handler.a1@example.com',
    handlerA2: 'handler.a2@example.com',
    submitterA1: 'submitter.a1@example.com',
    submitterA2: 'submitter.a2@example.com',
    submitterA3: 'submitter.a3@example.com',
    submitterA4: 'submitter.a4@example.com',
    disabledA: 'disabled.a@example.com',
    adminB: 'admin.b@example.com',
    handlerB1: 'handler.b1@example.com',
    submitterB1: 'submitter.b1@example.com',
  },
  ids: {
    adminA: 'u-a-admin',
    handlerA1: 'u-a-h1',
    handlerA2: 'u-a-h2',
    submitterA1: 'u-a-s1',
    submitterA2: 'u-a-s2',
    submitterA3: 'u-a-s3',
    submitterA4: 'u-a-s4',
    adminB: 'u-b-admin',
    handlerB1: 'u-b-h1',
    submitterB1: 'u-b-s1',
  },
  companies: { a: 'c-a', b: 'c-b' },
  groups: { a1: 'g-a1', a2: 'g-a2', b1: 'g-b1' },
}

/** 在隔离临时数据库 + 真实 HTTP 服务上执行 verify，结束后完整清理。 */
export async function withTicketApp(verify) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-app-'))
  const saved = { db: process.env.DB_PATH, smtp: process.env.SMTP_HOST }
  process.env.DB_PATH = path.join(directory, 'application.db')
  delete process.env.SMTP_HOST
  const cleanupEnv = () => {
    if (saved.db === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = saved.db
    if (saved.smtp !== undefined) process.env.SMTP_HOST = saved.smtp
  }
  let platform
  try {
    platform = await initializePlatform()
  } catch (error) {
    cleanupEnv()
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  const auth = createApplicationAuth(platform.db)
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, auth),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: auth.requireAnyAuth,
  })
  await withHttpServer(
    {
      fetch: app.fetch,
      close: async () => {
        await platform.close()
        cleanupEnv()
        await rm(directory, { recursive: true, force: true })
      },
    },
    verify,
  )
}

export async function login(url, email, password = seed.password) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return { response, body: await response.json() }
}

export async function api(url, token, path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) }
  if (token) headers.authorization = `Bearer ${token}`
  return fetch(`${url}${path}`, { ...options, headers })
}

/** JSON 响应读取（204 等无 body 响应返回 null）。 */
export async function apiJson(url, token, path, options = {}) {
  const response = await api(url, token, path, options)
  return { response, body: await response.json().catch(() => null) }
}
