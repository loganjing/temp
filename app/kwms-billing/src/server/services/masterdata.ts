import type { DbClient } from '@commonapp/dbkit'
import { newId, nowIso } from '../common/billno'
import { BusinessError, errors } from '../common/errors'
import { recordAuditEvent } from './auditlog'

// masterdata 域：组织、仓库、货主、外部合同引用、费用类型、货品类别、货品与当前库存事实。
// 组织隔离由调用方（路由层）以会话组织范围过滤后传参；本服务按参数执行。

export interface OrgRef { id: string; code: string; name: string }
export interface WarehouseRef { id: string; orgId: string; code: string; name: string; status: string }
export interface OwnerRef { id: string; orgId: string; ownerType: string; code: string; name: string }
export interface ContractRef { id: string; orgId: string; contractNo: string; status: string }
export interface CatalogRef { id: string; code: string; name: string }

export function createMasterdataService(db: DbClient, auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }) {
  async function listOrgs(orgId: string | null): Promise<OrgRef[]> {
    const rows = orgId
      ? await db.queryAll<OrgRef>({ text: 'SELECT id, code, name FROM organizations WHERE id = ? ORDER BY code', params: [orgId] })
      : await db.queryAll<OrgRef>({ text: 'SELECT id, code, name FROM organizations ORDER BY code' })
    return rows
  }

  async function listWarehouses(orgId: string | null): Promise<WarehouseRef[]> {
    const rows = orgId
      ? await db.queryAll<{ id: string; org_id: string; code: string; name: string; status: string }>({ text: "SELECT id, org_id, code, name, status FROM warehouses WHERE org_id = ? AND status = 'active' ORDER BY code", params: [orgId] })
      : await db.queryAll<{ id: string; org_id: string; code: string; name: string; status: string }>({ text: "SELECT id, org_id, code, name, status FROM warehouses WHERE status = 'active' ORDER BY code" })
    return rows.map((row) => ({ id: row.id, orgId: row.org_id, code: row.code, name: row.name, status: row.status }))
  }

  async function listOwners(orgId: string | null, ownerType: string | null): Promise<OwnerRef[]> {
    const conditions = ['1 = 1']
    const params: unknown[] = []
    if (orgId) {
      conditions.push('org_id = ?')
      params.push(orgId)
    }
    if (ownerType) {
      conditions.push('owner_type = ?')
      params.push(ownerType)
    }
    const rows = await db.queryAll<{ id: string; org_id: string; owner_type: string; code: string; name: string }>({ text: `SELECT id, org_id, owner_type, code, name FROM owners WHERE ${conditions.join(' AND ')} ORDER BY code`, params })
    return rows.map((row) => ({ id: row.id, orgId: row.org_id, ownerType: row.owner_type, code: row.code, name: row.name }))
  }

  async function listContracts(orgId: string | null): Promise<ContractRef[]> {
    const rows = orgId
      ? await db.queryAll<{ id: string; org_id: string; contract_no: string; status: string }>({ text: 'SELECT id, org_id, contract_no, status FROM contracts WHERE org_id = ? ORDER BY contract_no', params: [orgId] })
      : await db.queryAll<{ id: string; org_id: string; contract_no: string; status: string }>({ text: 'SELECT id, org_id, contract_no, status FROM contracts ORDER BY contract_no' })
    return rows.map((row) => ({ id: row.id, orgId: row.org_id, contractNo: row.contract_no, status: row.status }))
  }

  async function listFeeTypes(): Promise<CatalogRef[]> {
    return db.queryAll<CatalogRef>({ text: 'SELECT id, code, name FROM fee_types ORDER BY code' })
  }

  async function listGoodsCategories(): Promise<CatalogRef[]> {
    return db.queryAll<CatalogRef>({ text: 'SELECT id, code, name FROM goods_categories ORDER BY code' })
  }

  async function assertFeeTypeExists(id: string): Promise<void> {
    const row = await db.queryOne({ text: 'SELECT id FROM fee_types WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('费用类型不存在')
  }

  async function assertGoodsCategoryExists(id: string): Promise<void> {
    const row = await db.queryOne({ text: 'SELECT id FROM goods_categories WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('货品类别不存在')
  }

  async function upsertFeeType(actorId: string, id: string | null, input: { code?: string; name?: string }): Promise<CatalogRef> {
    if (id) {
      const existing = await db.queryOne<{ code: string; name: string }>({ text: 'SELECT code, name FROM fee_types WHERE id = ?', params: [id] })
      if (!existing) throw errors.notFound('费用类型不存在')
      const code = input.code ?? existing.code
      const name = input.name ?? existing.name
      if (input.code !== undefined && !code.trim()) throw errors.required('code')
      if (input.name !== undefined && !name.trim()) throw errors.required('name')
      const duplicate = await db.queryOne({ text: 'SELECT id FROM fee_types WHERE code = ? AND id <> ?', params: [code, id] })
      if (duplicate) throw new BusinessError('DUPLICATE_CODE', '费用类型编码已存在，请更换', 409, 'code')
      await db.run({ text: 'UPDATE fee_types SET code = ?, name = ? WHERE id = ?', params: [code, name, id] })
      await recordAuditEvent(auditKit, { action: '编辑', entityType: 'fee_type', entityId: id, actorUserId: actorId, metadata: { code, name } })
      return { id, code, name }
    }
    if (!input.code?.trim() || !input.name?.trim()) throw errors.required('code/name')
    const code = input.code.trim()
    const name = input.name.trim()
    const duplicate = await db.queryOne({ text: 'SELECT id FROM fee_types WHERE code = ?', params: [code] })
    if (duplicate) throw new BusinessError('DUPLICATE_CODE', '费用类型编码已存在，请更换', 409, 'code')
    const newFeeTypeId = newId()
    await db.run({ text: 'INSERT INTO fee_types (id, code, name) VALUES (?, ?, ?)', params: [newFeeTypeId, code, name] })
    await recordAuditEvent(auditKit, { action: '新增', entityType: 'fee_type', entityId: newFeeTypeId, actorUserId: actorId, metadata: { code, name } })
    return { id: newFeeTypeId, code, name }
  }

  async function upsertGoodsCategory(actorId: string, id: string | null, input: { code?: string; name?: string }): Promise<CatalogRef> {
    if (id) {
      const existing = await db.queryOne<{ code: string; name: string }>({ text: 'SELECT code, name FROM goods_categories WHERE id = ?', params: [id] })
      if (!existing) throw errors.notFound('货品类别不存在')
      const code = input.code ?? existing.code
      const name = input.name ?? existing.name
      if (input.code !== undefined && !code.trim()) throw errors.required('code')
      if (input.name !== undefined && !name.trim()) throw errors.required('name')
      const duplicate = await db.queryOne({ text: 'SELECT id FROM goods_categories WHERE code = ? AND id <> ?', params: [code, id] })
      if (duplicate) throw new BusinessError('DUPLICATE_CODE', '货品类别编码已存在，请更换', 409, 'code')
      await db.run({ text: 'UPDATE goods_categories SET code = ?, name = ? WHERE id = ?', params: [code, name, id] })
      await recordAuditEvent(auditKit, { action: '编辑', entityType: 'goods_category', entityId: id, actorUserId: actorId, metadata: { code, name } })
      return { id, code, name }
    }
    if (!input.code?.trim() || !input.name?.trim()) throw errors.required('code/name')
    const code = input.code.trim()
    const name = input.name.trim()
    const duplicate = await db.queryOne({ text: 'SELECT id FROM goods_categories WHERE code = ?', params: [code] })
    if (duplicate) throw new BusinessError('DUPLICATE_CODE', '货品类别编码已存在，请更换', 409, 'code')
    const newCategoryId = newId()
    await db.run({ text: 'INSERT INTO goods_categories (id, code, name) VALUES (?, ?, ?)', params: [newCategoryId, code, name] })
    await recordAuditEvent(auditKit, { action: '新增', entityType: 'goods_category', entityId: newCategoryId, actorUserId: actorId, metadata: { code, name } })
    return { id: newCategoryId, code, name }
  }

  async function assertWarehouseInOrg(warehouseId: string, orgId: string): Promise<WarehouseRef> {
    const row = await db.queryOne<{ id: string; org_id: string; code: string; name: string; status: string }>({ text: "SELECT id, org_id, code, name, status FROM warehouses WHERE id = ? AND org_id = ? AND status = 'active'", params: [warehouseId, orgId] })
    if (!row) throw errors.invalidInput('仓库不存在或不属于该组织', 'warehouseId')
    return { id: row.id, orgId: row.org_id, code: row.code, name: row.name, status: row.status }
  }

  async function assertOwnerInOrg(ownerId: string, orgId: string, ownerType: string): Promise<OwnerRef> {
    const row = await db.queryOne<{ id: string; org_id: string; owner_type: string; code: string; name: string }>({ text: 'SELECT id, org_id, owner_type, code, name FROM owners WHERE id = ? AND org_id = ? AND owner_type = ?', params: [ownerId, orgId, ownerType] })
    if (!row) throw errors.invalidInput('货主不存在、不属于该组织或类型不符', 'ownerId')
    return { id: row.id, orgId: row.org_id, ownerType: row.owner_type, code: row.code, name: row.name }
  }

  async function assertContractInOrg(contractId: string, orgId: string): Promise<ContractRef> {
    const row = await db.queryOne<{ id: string; org_id: string; contract_no: string; status: string }>({ text: 'SELECT id, org_id, contract_no, status FROM contracts WHERE id = ? AND org_id = ?', params: [contractId, orgId] })
    if (!row) throw errors.invalidInput('关联合同不存在或不属于该组织', 'contractId')
    return { id: row.id, orgId: row.org_id, contractNo: row.contract_no, status: row.status }
  }

  return {
    listOrgs,
    listWarehouses,
    listOwners,
    listContracts,
    listFeeTypes,
    listGoodsCategories,
    assertFeeTypeExists,
    assertGoodsCategoryExists,
    upsertFeeType,
    upsertGoodsCategory,
    assertWarehouseInOrg,
    assertOwnerInOrg,
    assertContractInOrg,
    _now: nowIso,
  }
}

export type MasterdataService = ReturnType<typeof createMasterdataService>
