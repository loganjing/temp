import { getDb } from './db.js';
import { AppError } from './errors.js';
import type { Capability, Role, UserContext } from '../shared/types.js';
import { ROLE_CAPABILITIES } from '../shared/types.js';

export interface Operator {
  userId: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  department: string;
  role: Role;
  capabilities: Capability[];
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  company_id: string;
  company_name: string;
  department: string;
  role: Role;
}

export function resolveOperatorByUserId(userId: string): Operator | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.company_id, u.department, u.role, c.name as company_name
    FROM app_user u
    JOIN company c ON u.company_id = c.id
    WHERE u.id = ?
  `).get(userId) as UserRow | undefined;

  if (!row) return null;

  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    companyId: row.company_id,
    companyName: row.company_name,
    department: row.department,
    role: row.role,
    capabilities: ROLE_CAPABILITIES[row.role] ?? [],
  };
}

export function requireOperator(operator: Operator | null): Operator {
  if (!operator) {
    throw new AppError('UNAUTHENTICATED', '缺少或无效会话');
  }
  return operator;
}

export function assertCapability(operator: Operator, capability: Capability): void {
  if (!operator.capabilities.includes(capability)) {
    throw new AppError('FORBIDDEN', `不具备该操作所需能力: ${capability}`);
  }
}

export function scopedCompanyId(operator: Operator, _requested?: string): string {
  // Always use operator's company. Client-supplied companyId only narrows (same company).
  return operator.companyId;
}

export function toUserContext(operator: Operator): UserContext {
  return {
    id: operator.userId,
    name: operator.name,
    email: operator.email,
    companyId: operator.companyId,
    companyName: operator.companyName,
    department: operator.department,
    role: operator.role,
  };
}
