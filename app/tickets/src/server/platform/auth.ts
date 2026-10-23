import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '../../shared/types'

// Module augmentation so Hono Context.get/set knows about authUser.
declare module 'hono' {
  interface ContextVariableMap {
    authUser: AuthUser
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'tickets-dev-secret-change-in-production'
const JWT_EXPIRY_SECONDS = 86400

// ---- Password hashing (scrypt, since bcrypt is not a dependency) ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = parts[1]
  const hash = parts[2]
  const testHash = scryptSync(password, salt, 64).toString('hex')
  const hashBuf = Buffer.from(hash, 'hex')
  const testBuf = Buffer.from(testHash, 'hex')
  if (hashBuf.length !== testBuf.length) return false
  return timingSafeEqual(hashBuf, testBuf)
}

// ---- JWT (HMAC-SHA256) ----

function b64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data
  return buf.toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', JWT_SECRET).update(data).digest('base64url')
}

export function signToken(payload: {
  userId: string
  companyId: string
  name: string
  email: string
  roles: string[]
}): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRY_SECONDS }))
  const signature = sign(`${header}.${body}`)
  return `${header}.${body}.${signature}`
}

export function verifyToken(token: string): AuthUser | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = sign(`${header}.${body}`)
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return {
      id: String(payload.userId),
      companyId: String(payload.companyId),
      name: payload.name,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    }
  } catch {
    return null
  }
}

// ---- Auth boundary middleware ----

export const authBoundary: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const token = auth.slice(7)
  const user = verifyToken(token)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  c.set('authUser', user)
  await next()
}

// ---- User store & resolver for platform resources ----

export interface UserRecord {
  id: number
  name: string
  email: string
  password_hash: string
  company_id: string
  department: string | null
  role: string
  status: string
  password_change_required: number
  created_at: string
}

export interface ResolvedIdentity {
  id: string
  name: string
  email: string
  companyId: string
  department: string | null
  role: string
  status: string
  passwordChangeRequired: boolean
}

export function createAuthResources(db: DbClient) {
  const userStore = {
    async create(
      input: {
        name: string
        email: string
        companyId: string
        department?: string | null
        role?: string
        passwordChangeRequired?: boolean
      },
      passwordHash: string,
    ): Promise<{ id: string; name: string; email: string; companyId: string }> {
      const now = new Date().toISOString()
      // Ensure company exists (idempotent)
      await db.run({
        text: 'INSERT OR IGNORE INTO companies (id, name, created_at) VALUES (?, ?, ?)',
        params: [input.companyId, input.companyId, now],
      })
      await db.run({
        text: `INSERT INTO users (name, email, password_hash, company_id, department, role, status, password_change_required, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        params: [
          input.name,
          input.email,
          passwordHash,
          input.companyId,
          input.department ?? null,
          input.role ?? 'submitter',
          input.passwordChangeRequired ? 1 : 0,
          now,
        ],
      })
      const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
      return {
        id: String(row?.id ?? 0),
        name: input.name,
        email: input.email,
        companyId: input.companyId,
      }
    },

    async findByEmail(email: string): Promise<UserRecord | null> {
      return db.queryOne<UserRecord>({
        text: 'SELECT * FROM users WHERE email = ?',
        params: [email],
      })
    },
  }

  const userResolver = {
    async findById(id: string | number): Promise<ResolvedIdentity | null> {
      const row = await db.queryOne<UserRecord>({
        text: 'SELECT * FROM users WHERE id = ?',
        params: [id],
      })
      if (!row) return null
      return {
        id: String(row.id),
        name: row.name,
        email: row.email,
        companyId: String(row.company_id),
        department: row.department,
        role: row.role,
        status: row.status,
        passwordChangeRequired: row.password_change_required === 1,
      }
    },
  }

  return { userStore, userResolver, hashPassword, verifyPassword, signToken }
}

export type AuthResources = ReturnType<typeof createAuthResources>
