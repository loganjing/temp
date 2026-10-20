import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { ApiError, notFound, validationFailed } from '../api-error'
import type { AdminUser, Company, Role } from '../../shared/tickets'
import { requireOps } from './authz-common'

export type CreateAdminUserInput = {
  email: string
  password: string
  displayName: string
  companyId: number
  department: string | null
  role: Role
}

export type PatchAdminUserInput = {
  displayName?: string
  department?: string | null
  role?: Role
}

type ProfileRow = {
  user_id: string
  email: string
  company_id: number
  display_name: string
  department: string | null
  role: Role
}

export function createIdentityService(db: DbClient, deps: { hashPassword: (password: string) => string }) {
  const nowIso = () => new Date().toISOString()

  const listCompanies = async (actor: { role: Role }): Promise<Company[]> => {
    requireOps(actor)
    return db.queryAll<Company>({ text: 'SELECT id, name, created_at FROM companies ORDER BY id' })
  }

  const createCompany = async (actor: { role: Role }, name: string): Promise<Company> => {
    requireOps(actor)
    const existing = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE name = ?', params: [name] })
    if (existing) throw new ApiError(409, 'DUPLICATE_NAME', '公司名称已存在')
    const createdAt = nowIso()
    await db.run({ text: 'INSERT INTO companies (name, created_at) VALUES (?, ?)', params: [name, createdAt] })
    const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    return { id: row?.id ?? 0, name, created_at: createdAt }
  }

  const toAdminUser = (row: ProfileRow): AdminUser => ({
    user_id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    company_id: row.company_id,
    department: row.department,
    role: row.role,
  })

  const listAdminUsers = async (actor: { role: Role }, companyId: number): Promise<AdminUser[]> => {
    requireOps(actor)
    const rows = await db.queryAll<ProfileRow>({
      text: 'SELECT p.user_id, u.email, p.company_id, p.display_name, p.department, p.role FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.company_id = ? ORDER BY p.user_id',
      params: [companyId],
    })
    return rows.map(toAdminUser)
  }

  // 同一事务内创建 userkit 本地用户与项目档案；email 全局唯一（契约第 5 节）。
  const createAdminUser = async (actor: { role: Role }, input: CreateAdminUserInput): Promise<AdminUser> => {
    requireOps(actor)
    const company = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [input.companyId] })
    if (!company) throw validationFailed('公司不存在')
    const duplicate = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE lower(email) = lower(?)', params: [input.email] })
    if (duplicate) throw new ApiError(409, 'DUPLICATE_EMAIL', '邮箱已被使用')
    const passwordHash = deps.hashPassword(input.password)
    const timestamp = nowIso()
    const userId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, 0, ?, ?)',
        params: [userId, input.displayName, input.email, passwordHash, timestamp, timestamp],
      })
      await tx.run({
        text: 'INSERT INTO user_profiles (user_id, company_id, display_name, department, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [userId, input.companyId, input.displayName, input.department, input.role, timestamp, timestamp],
      })
    })
    return {
      user_id: userId,
      email: input.email,
      display_name: input.displayName,
      company_id: input.companyId,
      department: input.department,
      role: input.role,
    }
  }

  const patchAdminUser = async (actor: { role: Role }, userId: string, patch: PatchAdminUserInput): Promise<AdminUser> => {
    requireOps(actor)
    const row = await db.queryOne<ProfileRow>({
      text: 'SELECT p.user_id, u.email, p.company_id, p.display_name, p.department, p.role FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?',
      params: [userId],
    })
    if (!row) throw notFound('用户不存在')
    const displayName = patch.displayName ?? row.display_name
    const department = patch.department !== undefined ? patch.department : row.department
    const role = patch.role ?? row.role
    const timestamp = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE user_profiles SET display_name = ?, department = ?, role = ?, updated_at = ? WHERE user_id = ?',
        params: [displayName, department, role, timestamp, userId],
      })
      await tx.run({
        text: 'UPDATE users SET name = ?, updated_at = ? WHERE id = ?',
        params: [displayName, timestamp, userId],
      })
    })
    return toAdminUser({ ...row, display_name: displayName, department, role })
  }

  return { listCompanies, createCompany, listAdminUsers, createAdminUser, patchAdminUser }
}

export type IdentityService = ReturnType<typeof createIdentityService>
