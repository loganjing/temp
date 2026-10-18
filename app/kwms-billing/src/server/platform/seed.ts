import { hashPassword } from '@commonapp/authkit'
import type { DbClient } from '@commonapp/dbkit'
import { newId, nowIso } from '../common/billno'

// 迁移后种子脚本：四类角色账号与组织绑定、费用类型与货品类别基础档案、
// 示例主数据与库存。幂等：已有组织数据时跳过（种子不覆盖业务数据）。

export interface SeedUser {
  username: string
  password: string
  name: string
  roles: string[]
  orgId: string
}

export const SEED_USERS: SeedUser[] = [
  { username: 'admin@kwms.local', password: 'Admin@12345', name: '系统管理员', roles: ['admin'], orgId: 'ORG-A' },
  { username: 'ops@kwms.local', password: 'Ops@12345', name: '仓储运营-安晴', roles: ['warehouse_ops'], orgId: 'ORG-A' },
  { username: 'finance@kwms.local', password: 'Finance@12345', name: '财务-沈默', roles: ['finance'], orgId: 'ORG-A' },
  { username: 'manager@kwms.local', password: 'Manager@12345', name: '客户经理-李川', roles: ['account_manager'], orgId: 'ORG-A' },
  { username: 'ops-b@kwms.local', password: 'Ops@12345', name: '仓储运营-南岭', roles: ['warehouse_ops'], orgId: 'ORG-B' },
]

export interface SeedResult {
  seeded: boolean
}

export async function runSeed(db: DbClient, permissionKit: {
  assignRole(userId: string, roleKey: string, scope?: { type?: string; id?: string }): Promise<void>
}): Promise<SeedResult> {
  const existing = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM organizations' })
  if (Number(existing?.total ?? 0) > 0) return { seeded: false }

  const timestamp = nowIso()

  // 组织与仓库
  await db.run({ text: 'INSERT INTO organizations (id, code, name) VALUES (?, ?, ?)', params: ['ORG-A', 'ORG-A', '华东区域'] })
  await db.run({ text: 'INSERT INTO organizations (id, code, name) VALUES (?, ?, ?)', params: ['ORG-B', 'ORG-B', '华南区域'] })
  await db.run({ text: 'INSERT INTO warehouses (id, org_id, code, name, status) VALUES (?, ?, ?, ?, ?)', params: ['WH-A1', 'ORG-A', 'WH-A1', '上海一号仓', 'active'] })
  await db.run({ text: 'INSERT INTO warehouses (id, org_id, code, name, status) VALUES (?, ?, ?, ?, ?)', params: ['WH-B1', 'ORG-B', 'WH-B1', '深圳一号仓', 'active'] })

  // 货主（业务组织 / 客户）
  await db.run({ text: 'INSERT INTO owners (id, org_id, owner_type, code, name) VALUES (?, ?, ?, ?, ?)', params: ['OWN-A1', 'ORG-A', 'business', 'OWN-A1', '联创供应链（业务组织）'] })
  await db.run({ text: 'INSERT INTO owners (id, org_id, owner_type, code, name) VALUES (?, ?, ?, ?, ?)', params: ['OWN-A2', 'ORG-A', 'customer', 'OWN-A2', '恒达贸易（客户）'] })
  await db.run({ text: 'INSERT INTO owners (id, org_id, owner_type, code, name) VALUES (?, ?, ?, ?, ?)', params: ['OWN-B1', 'ORG-B', 'customer', 'OWN-B1', '南海实业（客户）'] })

  // 外部仓储合作合同引用
  await db.run({ text: 'INSERT INTO contracts (id, org_id, contract_no, status) VALUES (?, ?, ?, ?)', params: ['CT-A001', 'ORG-A', 'HT-2026-A001', 'active'] })
  await db.run({ text: 'INSERT INTO contracts (id, org_id, contract_no, status) VALUES (?, ?, ?, ?)', params: ['CT-A002', 'ORG-A', 'HT-2026-A002', 'active'] })
  await db.run({ text: 'INSERT INTO contracts (id, org_id, contract_no, status) VALUES (?, ?, ?, ?)', params: ['CT-B001', 'ORG-B', 'HT-2026-B001', 'active'] })

  // 费用类型基础档案
  const feeTypes: Array<[string, string]> = [
    ['STO', '仓储费'],
    ['LOA', '装卸费'],
    ['OPE', '操作费'],
    ['CON', '耗材费'],
    ['INS', '保险费'],
  ]
  for (const [code, name] of feeTypes) {
    await db.run({ text: 'INSERT INTO fee_types (id, code, name) VALUES (?, ?, ?)', params: [`FT-${code}`, code, name] })
  }

  // 货品类别基础档案
  const goodsCategories: Array<[string, string]> = [
    ['GC1', '普货'],
    ['GC2', '危化品'],
    ['GC3', '食品'],
  ]
  for (const [code, name] of goodsCategories) {
    await db.run({ text: 'INSERT INTO goods_categories (id, code, name) VALUES (?, ?, ?)', params: [`GC-${code}`, code, name] })
  }

  // 货品与示例库存
  await db.run({ text: 'INSERT INTO goods (id, org_id, category_id, code, name, unit_volume, unit_gross_weight) VALUES (?, ?, ?, ?, ?, ?, ?)', params: ['GOODS-A1001', 'ORG-A', 'GC-GC1', 'A1001', '纸箱装配件', 0.5, 12.5] })
  await db.run({ text: 'INSERT INTO goods (id, org_id, category_id, code, name, unit_volume, unit_gross_weight) VALUES (?, ?, ?, ?, ?, ?, ?)', params: ['GOODS-A1002', 'ORG-A', 'GC-GC2', 'A1002', '桶装试剂', 1.2, 80] })
  await db.run({ text: 'INSERT INTO goods (id, org_id, category_id, code, name, unit_volume, unit_gross_weight) VALUES (?, ?, ?, ?, ?, ?, ?)', params: ['GOODS-B2001', 'ORG-B', 'GC-GC1', 'B2001', '布匹卷装', 0.8, 20] })
  await db.run({ text: 'INSERT INTO inventory (warehouse_id, owner_id, goods_id, quantity, occupied_locations) VALUES (?, ?, ?, ?, ?)', params: ['WH-A1', 'OWN-A2', 'GOODS-A1001', 500, 20] })
  await db.run({ text: 'INSERT INTO inventory (warehouse_id, owner_id, goods_id, quantity, occupied_locations) VALUES (?, ?, ?, ?, ?)', params: ['WH-A1', 'OWN-A2', 'GOODS-A1002', 100, 10] })
  await db.run({ text: 'INSERT INTO inventory (warehouse_id, owner_id, goods_id, quantity, occupied_locations) VALUES (?, ?, ?, ?, ?)', params: ['WH-B1', 'OWN-B1', 'GOODS-B2001', 300, 15] })

  // 四类角色示例账号（组织绑定支撑数据隔离）
  for (const seedUser of SEED_USERS) {
    const userId = newId()
    await db.run({
      text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?, 0, ?, ?)',
      params: [userId, seedUser.name, seedUser.username, seedUser.orgId, hashPassword(seedUser.password), timestamp, timestamp],
    })
    for (const role of seedUser.roles) {
      await permissionKit.assignRole(userId, role)
    }
  }

  return { seeded: true }
}
