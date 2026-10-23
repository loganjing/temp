import type { Context, MiddlewareHandler } from 'hono';

export type Role = 'submitter' | 'handler' | 'admin';

/**
 * Hono middleware factory: requires the authenticated user to have at least one of the specified roles.
 * The user object must already be set in the context by the auth middleware (c.get('user')).
 */
export function requireRole(...roles: Role[]): MiddlewareHandler {
  return async (c: Context, next) => {
    const user = c.get('user') as { roles: string[] } | undefined;
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const hasRole = user.roles.some((r) => roles.includes(r as Role));
    if (!hasRole) {
      return c.json({ error: 'Forbidden: insufficient role' }, 403);
    }
    await next();
  };
}

/**
 * Checks if a user has a specific role.
 */
export function hasRole(userRoles: string[], role: Role): boolean {
  return userRoles.includes(role);
}

/**
 * Checks if a user is an admin.
 */
export function isAdmin(userRoles: string[]): boolean {
  return hasRole(userRoles, 'admin');
}
