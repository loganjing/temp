// 测试装配辅助：隔离 SQLite 库 + 完整 Hono 应用（app.fetch 直接调用，不起 HTTP 服务）。
// 每个测试文件在独立 node:test 子进程中运行，DB_PATH 互不干扰。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { initializePlatform } from '../../src/server/platform/bootstrap.ts'
import { createApp } from '../../src/server/app.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../../src/server/routes.ts'

// seed 账号（src/server/platform/seed.ts）
export const SEED_ACCOUNTS = {
  admin: { username: 'admin@kwms.local', password: 'Admin@12345', orgId: 'ORG-A' },
  ops: { username: 'ops@kwms.local', password: 'Ops@12345', orgId: 'ORG-A' },
  finance: { username: 'finance@kwms.local', password: 'Finance@12345', orgId: 'ORG-A' },
  manager: { username: 'manager@kwms.local', password: 'Manager@12345', orgId: 'ORG-A' },
  opsB: { username: 'ops-b@kwms.local', password: 'Ops@12345', orgId: 'ORG-B' },
}

// seed 基础档案 ID（src/server/platform/seed.ts）
export const FEE_TYPES = { storage: 'FT-STO', loading: 'FT-LOA', operation: 'FT-OPE', consumable: 'FT-CON', insurance: 'FT-INS' }
export const GOODS_CATEGORIES = { general: 'GC-GC1', hazardous: 'GC-GC2', food: 'GC-GC3' }
export const ORGS = { A: 'ORG-A', B: 'ORG-B' }
export const WAREHOUSES = { A1: 'WH-A1', B1: 'WH-B1' }
export const OWNERS = { A1: 'OWN-A1', A2: 'OWN-A2', B1: 'OWN-B1' }
export const CONTRACTS = { A1: 'CT-A001', A2: 'CT-A002', B1: 'CT-B001' }

// WH-A1 / OWN-A2 当前库存度量（seed：A1001 500件20库位 + A1002 100件10库位）
export const MEASURE_A2 = { stockQty: 600, locations: 30, volume: 370, weight: 14250 }
// WH-B1 / OWN-B1 当前库存度量（seed：B2001 300件15库位）
export const MEASURE_B1 = { stockQty: 300, locations: 15, volume: 240, weight: 6000 }

export async function createKwmsApp() {
  const directory = await mkdtemp(path.join(tmpdir(), 'kwms-test-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'kwms.db')
  let platform
  try {
    platform = await initializePlatform()
  } catch (error) {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })

  const login = async (username, password) => {
    const response = await app.fetch(new Request('http://local/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }))
    if (response.status !== 200) throw new Error(`login failed for ${username}: HTTP ${response.status}`)
    return await response.json()
  }

  // 经 app.fetch 调用业务 API（携带 Bearer 会话）
  const api = async (token, method, pathValue, body) => {
    return app.fetch(new Request(`http://local${pathValue}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }))
  }

  const jsonOf = async (response) => await response.json()

  // 测试准备：为用户追加角色（承载 quote:audit / adjustment:audit 的角色配置授予路径）
  const grantRole = async (username, role) => {
    const row = await platform.db.queryOne({ text: 'SELECT id FROM users WHERE email = ?', params: [username] })
    if (!row) throw new Error(`seed user not found: ${username}`)
    await platform.permissionKit.assignRole(row.id, role)
    return row.id
  }

  const cleanup = async () => {
    await platform.close()
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }

  return { app, platform, login, api, jsonOf, grantRole, cleanup }
}
