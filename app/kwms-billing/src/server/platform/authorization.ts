export const authorizationRegistry = {
  permissions: {
    usersRead: { key: 'platform.users.read', description: 'View and search users' },
    usersManage: { key: 'platform.users.manage', description: 'Create and update users' },
    rolesAssign: { key: 'platform.roles.assign', description: 'Assign registered roles to users' },
  },
  roles: {
    admin: ['platform.users.read', 'platform.users.manage', 'platform.roles.assign'],
  },
} as const
