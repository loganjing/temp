export type UserRecord = {
  id: string
  name: string
  email: string
  phone: string | null
  enabled: boolean
  companyId: string | null
  passwordHash: string
  passwordChangeRequired: boolean
  createdAt: string
  updatedAt: string
}
export type UserInput = { name: string; email: string; phone?: string | null; companyId?: string | null; enabled?: boolean; passwordChangeRequired?: boolean }
export type PublicUser = Omit<UserRecord, 'passwordHash'>
export type AuthUser = { id: string; role: string; status: string; name: string; email: string; phone: string | null; companyId: string | null; roles: string[]; passwordChangeRequired: boolean }
export type UserStore = {
  findById(id: string): Promise<UserRecord | null>
  findByField(field: string, value: string): Promise<UserRecord | null>
  findByCredential(identifier: string, field?: 'email' | 'phone'): Promise<UserRecord | null>
  count(options?: { search?: string }): Promise<number>
  create(input: UserInput, passwordHash: string): Promise<PublicUser>
  list(options?: { search?: string; limit?: number; offset?: number }): Promise<PublicUser[]>
  update(id: string, input: Pick<UserInput, 'name' | 'email' | 'phone'> & { companyId?: string | null }): Promise<UserRecord | null>
  setEnabled(id: string, enabled: boolean): Promise<boolean>
  updatePassword(id: string, passwordHash: string, passwordChangeRequired?: boolean): Promise<boolean>
}
export function createUserStore(db: unknown, options?: { now?: () => string; createId?: () => string }): UserStore
export function createUserResolver(store: UserStore, options?: { activeStatus?: string; disabledStatus?: string; getRoles?: (userId: string) => Promise<string[]> }): {
  findById(id: string): Promise<AuthUser | null>
  findByField(field: string, value: string): Promise<AuthUser | null>
  findByCredential(identifier: string, field?: 'email' | 'phone'): Promise<UserRecord | null>
}
