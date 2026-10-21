import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { DbClient } from '@commonapp/dbkit'
import { ApiError, unauthenticated } from '../errors'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SessionUser = {
  id: number
  username: string
  fullName: string
  email: string
  companyId: number
  companyName: string
  department: string
}

const USER_SUMMARY_SELECT = `
  SELECT u.id, u.username, u.full_name AS fullName, u.email, u.company_id AS companyId, co.name AS companyName, u.department
  FROM users u JOIN companies co ON co.id = u.company_id`

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// 密码哈希格式：scrypt:N:r:p:saltB64:hashB64（种子为预计算常量，校验使用常量时间比较）。
async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || expected.length === 0) return false
  const actual = await scryptAsync(password, salt, expected.length, { N, r, p })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function login(db: DbClient, username: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const row = await db.queryOne<SessionUser & { passwordHash: string }>({
    text: `SELECT u.id, u.username, u.full_name AS fullName, u.email, u.company_id AS companyId, co.name AS companyName, u.department,
        u.password_hash AS passwordHash
      FROM users u JOIN companies co ON co.id = u.company_id
      WHERE u.username = ?`,
    params: [username],
  })
  // 用户名或密码错误统一 401 文案，不区分是哪一项错误。
  if (!row || !(await verifyPassword(row.passwordHash, password))) {
    throw new ApiError(401, 'UNAUTHENTICATED', '用户名或密码错误')
  }
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  await db.run({
    text: 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    params: [hashToken(token), row.id, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString()],
  })
  const { passwordHash: _passwordHash, ...user } = row
  return { token, user }
}

export async function logout(db: DbClient, token: string): Promise<void> {
  await db.run({ text: 'DELETE FROM sessions WHERE token_hash = ?', params: [hashToken(token)] })
}

export async function resolveSessionUser(db: DbClient, token: string): Promise<SessionUser | null> {
  return db.queryOne<SessionUser>({
    text: `${USER_SUMMARY_SELECT.replace('FROM users u', 'FROM sessions s JOIN users u ON u.id = s.user_id')}
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    params: [hashToken(token), new Date().toISOString()],
  })
}
