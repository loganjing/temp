import { createPermissionKit, type AuthorizationContext, type PermissionRegistry } from '@commonapp/permissionkit'
import type { DbClient } from '@commonapp/dbkit'

/**
 * 工单系统权限注册表。仅声明需求与角色边界明确需要的业务权限键和角色。
 * 公司隔离授权基于服务端可信的 user_profiles.company_id，不依赖客户端传入的 companyId。
 */
const PERMISSION_REGISTRY: PermissionRegistry = {
  permissions: {
    'ticket.create': { key: 'ticket.create', description: 'Create a ticket as submitter' },
    'ticket.view': { key: 'ticket.view', description: 'View tickets within own company' },
    'ticket.update': { key: 'ticket.update', description: 'Update ticket priority, group or status' },
    'ticket.reply': { key: 'ticket.reply', description: 'Reply to a ticket' },
    'ticket.transfer': { key: 'ticket.transfer', description: 'Transfer a pending ticket' },
    'ticket.complete': { key: 'ticket.complete', description: 'Complete a pending ticket' },
    'ticket.view_submitter': { key: 'ticket.view_submitter', description: 'View full submitter info' },
    'ticket.rate': { key: 'ticket.rate', description: 'Rate a completed ticket as submitter' },
    'group.manage': { key: 'group.manage', description: 'Manage business groups and members' },
    'category_rule.manage': { key: 'category_rule.manage', description: 'Manage category assignment rules' },
    'statistics.view': { key: 'statistics.view', description: 'View statistics and dashboard' },
    'audit.view': { key: 'audit.view', description: 'View audit logs' },
    'workbench.view': { key: 'workbench.view', description: 'View the handler workbench' },
  },
  roles: {
    submitter: ['ticket.create', 'ticket.view', 'ticket.reply', 'ticket.rate'],
    handler: ['ticket.view', 'ticket.update', 'ticket.reply', 'ticket.transfer', 'ticket.complete', 'ticket.view_submitter', 'workbench.view'],
    group_admin: ['ticket.view', 'group.manage', 'category_rule.manage', 'statistics.view', 'workbench.view', 'audit.view'],
    admin: [
      'ticket.create', 'ticket.view', 'ticket.update', 'ticket.reply', 'ticket.transfer',
      'ticket.complete', 'ticket.view_submitter', 'ticket.rate',
      'group.manage', 'category_rule.manage', 'statistics.view', 'audit.view', 'workbench.view',
    ],
  },
}

export type TicketPermissionKit = ReturnType<typeof createPermissionKit>

export function createPermissionPolicy(db: DbClient) {
  const kit = createPermissionKit(db)
  return {
    registry: PERMISSION_REGISTRY,
    sync: () => kit.syncRegistry(PERMISSION_REGISTRY),
    assignRole: (userId: string, role: string, scope?: { type?: string; id?: string }) =>
      kit.assignRole(userId, role, scope),
    loadContext: (userId: string): Promise<AuthorizationContext> => kit.loadAuthorizationContext(userId),
    hasPermission: (context: AuthorizationContext, permission: string) =>
      kit.hasPermission(context, permission),
    /** 检查权限，不通过返回 false（由调用方决定 HTTP 响应）。 */
    can: async (userId: string, permission: string) => {
      const context = await kit.loadAuthorizationContext(userId)
      return kit.hasPermission(context, permission)
    },
  }
}
