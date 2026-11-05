import type { PermissionRegistry } from '@commonapp/permissionkit'

// 工单系统业务权限键与角色定义。角色与权限遵循 architecture-baseline.md。
// permissionkit 要求注册表显式包含 'admin' 角色（平台超级管理员，拥有全部业务权限）。
export const ticketPermissionRegistry: PermissionRegistry = {
  permissions: {
    'ticket.create': { key: 'ticket.create', description: 'Create a ticket' },
    'ticket.reply': { key: 'ticket.reply', description: 'Reply to a ticket' },
    'ticket.evaluate': { key: 'ticket.evaluate', description: 'Evaluate a completed ticket' },
    'ticket.cancel': { key: 'ticket.cancel', description: 'Cancel a ticket' },
    'ticket.assign': { key: 'ticket.assign', description: 'Assign a ticket to a group' },
    'ticket.transfer': { key: 'ticket.transfer', description: 'Transfer a ticket between groups' },
    'ticket.complete': { key: 'ticket.complete', description: 'Complete a ticket' },
    'ticket.view_workbench': { key: 'ticket.view_workbench', description: 'View the workbench' },
    'ticket.manage_groups': { key: 'ticket.manage_groups', description: 'Manage business groups' },
    'ticket.manage_rules': { key: 'ticket.manage_rules', description: 'Manage category assignment rules' },
    'ticket.view_statistics': { key: 'ticket.view_statistics', description: 'View statistics' },
  },
  roles: {
    ticket_submitter: ['ticket.create', 'ticket.reply', 'ticket.evaluate', 'ticket.cancel'],
    ticket_handler: ['ticket.reply', 'ticket.assign', 'ticket.transfer', 'ticket.complete', 'ticket.cancel', 'ticket.view_workbench'],
    ticket_admin: [
      'ticket.manage_groups',
      'ticket.manage_rules',
      'ticket.view_statistics',
      'ticket.view_workbench',
      'ticket.reply',
      'ticket.assign',
      'ticket.transfer',
      'ticket.complete',
      'ticket.cancel',
    ],
    admin: [
      'ticket.create',
      'ticket.reply',
      'ticket.evaluate',
      'ticket.cancel',
      'ticket.assign',
      'ticket.transfer',
      'ticket.complete',
      'ticket.view_workbench',
      'ticket.manage_groups',
      'ticket.manage_rules',
      'ticket.view_statistics',
    ],
  },
}

export type TicketPermissionKey = keyof typeof ticketPermissionRegistry.permissions
