import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'

export interface CompanyRow { id: string; name: string; created_at: string }
export interface DepartmentRow { id: string; company_id: string; name: string; created_at: string }
export interface UserProfileRow {
  user_id: string
  company_id: string
  department_id: string | null
  display_name: string
}

const now = () => new Date().toISOString()

export function createCompanyRepository(db: DbClient) {
  return {
    async createCompany(name: string): Promise<CompanyRow> {
      const id = randomUUID()
      const created_at = now()
      await db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [id, name, created_at] })
      return { id, name, created_at }
    },
    async getCompany(id: string): Promise<CompanyRow | null> {
      return db.queryOne({ text: 'SELECT id, name, created_at FROM companies WHERE id = ?', params: [id] })
    },
    async createDepartment(company_id: string, name: string): Promise<DepartmentRow> {
      const id = randomUUID()
      const created_at = now()
      await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, company_id, name, created_at] })
      return { id, company_id, name, created_at }
    },
    async getDepartment(id: string): Promise<DepartmentRow | null> {
      return db.queryOne({ text: 'SELECT id, company_id, name, created_at FROM departments WHERE id = ?', params: [id] })
    },
    async upsertProfile(user_id: string, company_id: string, department_id: string | null, display_name: string): Promise<void> {
      await db.run({
        text: 'INSERT INTO user_profiles (user_id, company_id, department_id, display_name) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, department_id = excluded.department_id, display_name = excluded.display_name',
        params: [user_id, company_id, department_id, display_name],
      })
    },
    async getProfile(user_id: string): Promise<UserProfileRow | null> {
      return db.queryOne({ text: 'SELECT user_id, company_id, department_id, display_name FROM user_profiles WHERE user_id = ?', params: [user_id] })
    },
  }
}
