import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import type { DbClient } from '@commonapp/dbkit'

const PERMISSIONS = {
  'ticket.submit': { key: 'ticket.submit', description: '提交工单' },
  'ticket.handle': { key: 'ticket.handle', description: '处理业务组工单' },
  'company.configure': { key: 'company.configure', description: '维护本公司业务组、分类与分配规则' },
  'stats.company': { key: 'stats.company', description: '查看本公司统计' },
  'stats.platform': { key: 'stats.platform', description: '查看平台聚合统计' },
} as const

// `admin` 由 permissionkit 注册表强制要求，仅作为平台保留角色，不参与业务授权。
export const permissionRegistry: PermissionRegistry = {
  permissions: PERMISSIONS,
  roles: {
    admin: Object.keys(PERMISSIONS),
    company_admin: ['ticket.submit', 'ticket.handle', 'company.configure', 'stats.company'],
    agent: ['ticket.submit', 'ticket.handle'],
    platform_stats: ['stats.platform'],
  },
}

export function createPermissions(db: DbClient) {
  return createPermissionKit(db)
}
