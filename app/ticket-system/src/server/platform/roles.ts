import type { PermissionKit } from './permission'

const ROLES: Record<string, { name: string; permissions: string[] }> = {
  submitter: {
    name: '提交人',
    permissions: ['ticket:create', 'ticket:reply_own', 'ticket:cancel_own', 'ticket:evaluate_own'],
  },
  handler: {
    name: '处理人',
    permissions: ['ticket:reply_assigned', 'ticket:complete_assigned', 'ticket:transfer_assigned', 'ticket:view_submitter_info'],
  },
  admin: {
    name: '管理员',
    permissions: ['ticket:create', 'ticket:cancel_any', 'ticket:view_submitter_info', 'company:manage', 'group:manage', 'rule:manage', 'user:manage'],
  },
}

export async function registerRoles(permissionKit: PermissionKit) {
  const permissions: Record<string, { key: string; description?: string }> = {}
  const roles: Record<string, readonly string[]> = {}
  for (const [key, def] of Object.entries(ROLES)) {
    roles[key] = def.permissions
    for (const p of def.permissions) {
      permissions[p] = { key: p, description: p }
    }
  }
  await permissionKit.syncRegistry({ permissions, roles })
}
