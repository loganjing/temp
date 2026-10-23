import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import type { DbClient } from '@commonapp/dbkit'
import type { RoleKey } from '../../shared/enums'

const registry: PermissionRegistry = {
  permissions: {
    'ticket.create': { key: 'ticket.create', description: 'Create tickets' },
    'ticket.view': { key: 'ticket.view', description: 'View tickets' },
    'ticket.reply': { key: 'ticket.reply', description: 'Reply to tickets' },
    'ticket.cancel': { key: 'ticket.cancel', description: 'Cancel tickets' },
    'ticket.transfer': { key: 'ticket.transfer', description: 'Transfer tickets' },
    'ticket.complete': { key: 'ticket.complete', description: 'Complete tickets' },
    'ticket.view_submitter': { key: 'ticket.view_submitter', description: 'View submitter info' },
    'ticket.evaluate': { key: 'ticket.evaluate', description: 'Evaluate tickets' },
    'business_group.manage': { key: 'business_group.manage', description: 'Manage business groups' },
    'assignment_rule.manage': { key: 'assignment_rule.manage', description: 'Manage assignment rules' },
    'statistics.view': { key: 'statistics.view', description: 'View statistics' },
  },
  roles: {
    submitter: ['ticket.create', 'ticket.view', 'ticket.reply', 'ticket.cancel', 'ticket.evaluate'],
    handler: ['ticket.view', 'ticket.reply', 'ticket.transfer', 'ticket.complete', 'ticket.view_submitter'],
    admin: [
      'ticket.create', 'ticket.view', 'ticket.reply', 'ticket.cancel',
      'ticket.transfer', 'ticket.complete', 'ticket.view_submitter',
      'ticket.evaluate', 'business_group.manage', 'assignment_rule.manage',
      'statistics.view',
    ],
  },
}

export function createPermissionService(db: DbClient) {
  const kit = createPermissionKit(db)
  return {
    kit,
    registry,
    async sync() {
      return kit.syncRegistry(registry)
    },
    async assignRole(userId: string, roleKey: RoleKey, scope?: { type?: string; id?: string }) {
      return kit.assignRole(userId, roleKey, scope)
    },
    async getRoles(userId: string): Promise<string[]> {
      return kit.getRoles(userId)
    },
    async hasRole(userId: string, roleKey: string): Promise<boolean> {
      const roles = await kit.getRoles(userId)
      return roles.includes(roleKey)
    },
    async isAdmin(userId: string): Promise<boolean> {
      return this.hasRole(userId, 'admin')
    },
  }
}

export type PermissionService = ReturnType<typeof createPermissionService>
