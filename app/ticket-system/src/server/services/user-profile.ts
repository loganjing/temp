import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { ApiError, conflict, notFound, validationError } from '../errors'
import type { Role } from '../session'

/** 契约 §2 用户对象（业务档案视角）。 */
export interface UserAccount {
  userId: string
  username: string
  displayName: string
  email: string | null
  companyId: number | null
  companyName: string | null
  department: string | null
  role: Role | null
}

interface UserAccountRow {
  id: string
  username: string
  display_name: string | null
  profile_email: string | null
  platform_email: string | null
  company_id: number | null
  company_name: string | null
  department: string | null
  role: Role | null
}

const USER_SELECT = `
  SELECT u.id, u.name AS username, up.display_name, up.email AS profile_email, u.email AS platform_email,
         up.company_id, co.name AS company_name, up.department, up.role
  FROM users u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  LEFT JOIN companies co ON co.id = up.company_id`

const toAccount = (row: UserAccountRow): UserAccount => ({
  userId: row.id,
  username: row.username,
  displayName: row.display_name ?? row.username,
  email: row.profile_email ?? row.platform_email,
  companyId: row.company_id,
  companyName: row.company_name,
  department: row.department,
  role: row.role,
})

export async function listUsers(
  db: DbClient,
  options: { companyId?: number; page: number; pageSize: number },
): Promise<{ items: UserAccount[]; total: number; page: number; pageSize: number }> {
  const filter = options.companyId === undefined ? '' : 'WHERE up.company_id = ?'
  const params = options.companyId === undefined ? [] : [options.companyId]
  const rows = await db.queryAll<UserAccountRow>({
    text: `${USER_SELECT} ${filter} ORDER BY u.created_at, u.id LIMIT ? OFFSET ?`,
    params: [...params, options.pageSize, (options.page - 1) * options.pageSize],
  })
  const total = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id ${filter}`,
    params,
  })
  return { items: rows.map(toAccount), total: Number(total?.total ?? 0), page: options.page, pageSize: options.pageSize }
}

export async function findUserAccount(db: DbClient, userId: string): Promise<UserAccount | null> {
  const row = await db.queryOne<UserAccountRow>({ text: `${USER_SELECT} WHERE u.id = ?`, params: [userId] })
  return row ? toAccount(row) : null
}

export interface CreateUserInput {
  username: string
  password: string
  displayName: string
  email: string
  companyId: number
  department: string
  role: Role
}

/** 开户：同一事务写 users（认证凭证）与 user_profiles（业务档案）。 */
export async function createUserAccount(
  db: DbClient,
  hashPassword: (password: string) => string,
  input: CreateUserInput,
): Promise<UserAccount> {
  const company = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [input.companyId] })
  if (!company) throw validationError('companyId does not exist')
  const id = randomUUID()
  const at = new Date().toISOString()
  await db.transaction(async (tx) => {
    if (await tx.queryOne({ text: 'SELECT 1 FROM users WHERE name = ?', params: [input.username] })) {
      throw conflict('USERNAME_TAKEN', 'This username is already taken')
    }
    if (await tx.queryOne({ text: 'SELECT 1 FROM users WHERE email = ?', params: [input.email] })) {
      throw conflict('EMAIL_TAKEN', 'This email is already in use')
    }
    await tx.run({
      text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, 0, ?, ?)',
      params: [id, input.username, input.email, hashPassword(input.password), at, at],
    })
    await tx.run({
      text: 'INSERT INTO user_profiles (user_id, display_name, email, company_id, department, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [id, input.displayName, input.email, input.companyId, input.department, input.role, at],
    })
  })
  const account = await findUserAccount(db, id)
  if (!account) throw new ApiError(500, 'INTERNAL_ERROR', 'Created user could not be read back')
  return account
}

export interface UpdateProfileInput {
  displayName?: string
  email?: string
  companyId?: number
  department?: string
  role?: Role
}

/** 档案更新：档案邮箱与 users.email 同步，保持登录辅助信息一致。 */
export async function updateUserAccount(
  db: DbClient,
  userId: string,
  input: UpdateProfileInput,
): Promise<UserAccount> {
  const user = await db.queryOne<{ id: string; name: string; email: string | null }>({
    text: 'SELECT id, name, email FROM users WHERE id = ?',
    params: [userId],
  })
  if (!user) throw notFound('User not found')
  if (input.companyId !== undefined) {
    const company = await db.queryOne({ text: 'SELECT id FROM companies WHERE id = ?', params: [input.companyId] })
    if (!company) throw validationError('companyId does not exist')
  }
  const existing = await db.queryOne<{ display_name: string; email: string | null; company_id: number | null; department: string | null; role: Role }>({
    text: 'SELECT display_name, email, company_id, department, role FROM user_profiles WHERE user_id = ?',
    params: [userId],
  })
  const merged = {
    displayName: input.displayName ?? existing?.display_name ?? user.name,
    email: input.email ?? existing?.email ?? user.email,
    companyId: input.companyId ?? existing?.company_id ?? null,
    department: input.department ?? existing?.department ?? '',
    role: input.role ?? existing?.role ?? 'submitter',
  }
  const at = new Date().toISOString()
  await db.transaction(async (tx) => {
    if (input.email !== undefined && input.email !== user.email) {
      if (await tx.queryOne({ text: 'SELECT 1 FROM users WHERE email = ? AND id <> ?', params: [input.email, userId] })) {
        throw conflict('EMAIL_TAKEN', 'This email is already in use')
      }
      await tx.run({ text: 'UPDATE users SET email = ?, updated_at = ? WHERE id = ?', params: [input.email, at, userId] })
    }
    await tx.run({
      text: `INSERT INTO user_profiles (user_id, display_name, email, company_id, department, role, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               display_name = excluded.display_name,
               email = excluded.email,
               company_id = excluded.company_id,
               department = excluded.department,
               role = excluded.role`,
      params: [userId, merged.displayName, merged.email, merged.companyId, merged.department, merged.role, at],
    })
  })
  const account = await findUserAccount(db, userId)
  if (!account) throw new ApiError(500, 'INTERNAL_ERROR', 'Updated user could not be read back')
  return account
}
