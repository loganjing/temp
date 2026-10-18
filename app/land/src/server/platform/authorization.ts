import { randomUUID } from 'node:crypto'

/**
 * 业务权限码与 7 类角色（契约 0.1 节）。
 * permissionkit 在启动时 syncRegistry 同步到 roles/permissions/role_permissions。
 */
export const businessPermissions = {
  parcelsRead: { key: 'parcels:read', description: 'View parcels' },
  parcelsWrite: { key: 'parcels:write', description: 'Create and update parcels, attachments, maps' },
  parcelProfileWrite: { key: 'parcel-profile:write', description: 'Update parcel profile' },
  marketWrite: { key: 'market:write', description: 'Maintain market references and comparables' },
  quickAssessmentsWrite: { key: 'quick-assessments:write', description: 'Create and compute quick assessments' },
  plansRead: { key: 'plans:read', description: 'View plans, run analysis' },
  plansWrite: { key: 'plans:write', description: 'Edit owned plans' },
  plansCopy: { key: 'plans:copy', description: 'Copy plans into new versions' },
  plansFormalize: { key: 'plans:formalize', description: 'Formalize owned plans' },
  plansCostsWrite: { key: 'plans:costs:write', description: 'Edit plan costs and common pools' },
  submissionsCreate: { key: 'submissions:create', description: 'Submit formalized plans for approval' },
  submissionsApprove: { key: 'submissions:approve', description: 'Approve or return submissions' },
  dashboardsRead: { key: 'dashboards:read', description: 'Read management dashboards' },
  handoffRead: { key: 'handoff:read', description: 'Read downstream handoff packages' },
  usersManage: { key: 'users:manage', description: 'Manage users' },
  rolesManage: { key: 'roles:manage', description: 'Manage roles and permission codes' },
  parametersManage: { key: 'parameters:manage', description: 'Publish parameter versions' },
  auditRead: { key: 'audit:read', description: 'Read audit events' },
} as const

/** 契约 0.1 节角色表（downstream 附加 parcels:read：契约第 2 节 parcels 列表对全部已认证默认授予，用于定位交接地块）。 */
export const businessRoles = {
  'investment-officer': {
    name: '投资业务人员',
    permissions: [
      'parcels:read', 'parcels:write', 'parcel-profile:write', 'market:write',
      'quick-assessments:write', 'plans:read', 'plans:copy', 'submissions:create',
    ],
  },
  'plan-owner': {
    name: '方案负责人',
    permissions: [
      'parcels:read', 'parcels:write', 'parcel-profile:write', 'market:write',
      'quick-assessments:write', 'plans:read', 'plans:copy', 'submissions:create',
      'plans:write', 'plans:formalize',
    ],
  },
  'market-researcher': {
    name: '市场/研究人员',
    permissions: ['parcels:read', 'market:write'],
  },
  'finance-cost': {
    name: '财务/成本人员',
    permissions: ['parcels:read', 'plans:read', 'plans:costs:write', 'parameters:read'],
  },
  approver: {
    name: '管理层/审批人',
    permissions: ['parcels:read', 'plans:read', 'submissions:approve', 'dashboards:read', 'handoff:read'],
  },
  downstream: {
    name: '下游部门',
    permissions: ['handoff:read', 'parcels:read'],
  },
  admin: {
    name: '业务规则管理员',
    permissions: [
      'users:manage', 'roles:manage', 'parameters:manage', 'audit:read', 'parcels:read',
      'platform.users.read', 'platform.users.manage', 'platform.roles.assign',
    ],
  },
} as const

/** finance-cost 引用的只读参数码（契约 0.1 节该角色持有 parameters:read）。 */
export const readParameterCode = 'parameters:read'

export const authorizationRegistry = {
  permissions: {
    ...businessPermissions,
    parametersRead: { key: readParameterCode, description: 'Read parameter versions' },
    platformUsersRead: { key: 'platform.users.read', description: 'View and search users' },
    platformUsersManage: { key: 'platform.users.manage', description: 'Create and update users' },
    platformRolesAssign: { key: 'platform.roles.assign', description: 'Assign registered roles to users' },
  },
  roles: Object.fromEntries(
    Object.entries(businessRoles).map(([code, role]) => [code, [...role.permissions]])
  ) as Record<string, readonly string[]>,
} as const

/** 统一 ID 生成（业务对象用可读前缀便于审计阅读）。 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}
