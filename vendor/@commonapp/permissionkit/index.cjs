var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/index.js
var exports_src = {};
__export(exports_src, {
  createPermissionKit: () => createPermissionKit,
  PermissionDeniedError: () => PermissionDeniedError
});
module.exports = __toCommonJS(exports_src);

class PermissionDeniedError extends Error {
  constructor(permissionKey) {
    super(`Missing permission: ${permissionKey}`);
    this.name = "PermissionDeniedError";
    this.permissionKey = permissionKey;
  }
}
function createPermissionKit(db, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async syncRegistry(registry) {
      const permissions = registry.permissions ?? {};
      const roles = registry.roles ?? {};
      const permissionKeys = Object.values(permissions).map((permission) => permission.key);
      if (new Set(permissionKeys).size !== permissionKeys.length)
        throw new Error("Permission keys must be unique");
      if (permissionKeys.some((key) => typeof key !== "string" || !key.trim()))
        throw new Error("Permission keys must be non-empty strings");
      if (!Array.isArray(roles.admin) || roles.admin.length === 0)
        throw new Error("The project permission registry must grant explicit permissions to the admin role");
      const known = new Set(permissionKeys);
      for (const [role, keys] of Object.entries(roles)) {
        if (!/^[a-z][a-z0-9_-]*$/.test(role) || !Array.isArray(keys) || new Set(keys).size !== keys.length || keys.some((key) => !known.has(key)))
          throw new Error(`Role ${role} has an invalid key or references an unknown permission`);
      }
      await db.transaction(async (tx) => {
        await tx.run({ text: "DELETE FROM role_permissions" });
        await tx.run({ text: "DELETE FROM roles WHERE role_key NOT IN (" + Object.keys(roles).map(() => "?").join(", ") + ")", params: Object.keys(roles) });
        if (permissionKeys.length)
          await tx.run({ text: "DELETE FROM permissions WHERE permission_key NOT IN (" + permissionKeys.map(() => "?").join(", ") + ")", params: permissionKeys });
        else
          await tx.run({ text: "DELETE FROM permissions" });
        for (const [key, permission] of Object.entries(permissions)) {
          await tx.run({ text: "INSERT INTO permissions (permission_key, description, updated_at) VALUES (?, ?, ?) ON CONFLICT(permission_key) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at", params: [permission.key, permission.description ?? key, now()] });
        }
        for (const [key] of Object.entries(roles)) {
          await tx.run({ text: "INSERT INTO roles (role_key, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(role_key) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at", params: [key, key, now()] });
        }
        for (const [roleKey, keys] of Object.entries(roles)) {
          await tx.run({ text: "DELETE FROM role_permissions WHERE role_key = ?", params: [roleKey] });
          for (const permissionKey of keys) {
            await tx.run({ text: "INSERT INTO role_permissions (role_key, permission_key) VALUES (?, ?)", params: [roleKey, permissionKey] });
          }
        }
      });
      return { roles: Object.keys(roles).length, permissions: permissionKeys.length };
    },
    async assignRole(userId, roleKey, scope = {}) {
      const role = await db.queryOne({ text: "SELECT role_key FROM roles WHERE role_key = ?", params: [roleKey] });
      if (!role)
        throw new Error("Unknown role");
      await db.run({
        text: "INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, role_key, scope_type, scope_id) DO NOTHING",
        params: [userId, roleKey, scope.type ?? "", scope.id ?? "", now()]
      });
    },
    async revokeRole(userId, roleKey, scope = {}) {
      await db.transaction(async (tx) => {
        if (roleKey === "admin") {
          const count = await tx.queryOne({ text: "SELECT COUNT(DISTINCT user_id) AS total FROM user_role_assignments WHERE role_key = ?", params: ["admin"] });
          const current = await tx.queryOne({ text: "SELECT COUNT(*) AS total FROM user_role_assignments WHERE user_id = ? AND role_key = ?", params: [userId, "admin"] });
          if (Number(count?.total ?? 0) <= 1 && Number(current?.total ?? 0) > 0)
            throw new Error("Cannot revoke the last admin assignment");
        }
        await tx.run({ text: "DELETE FROM user_role_assignments WHERE user_id = ? AND role_key = ? AND scope_type = ? AND scope_id = ?", params: [userId, roleKey, scope.type ?? "", scope.id ?? ""] });
      });
    },
    async getRoles(userId) {
      const rows = await db.queryAll({ text: "SELECT role_key FROM user_role_assignments WHERE user_id = ? ORDER BY role_key", params: [userId] });
      return rows.map((row) => row.role_key);
    },
    async listRoles() {
      return db.queryAll({ text: "SELECT role_key AS key, name FROM roles ORDER BY role_key" });
    },
    async loadAuthorizationContext(userId) {
      const rows = await db.queryAll({
        text: "SELECT DISTINCT ura.role_key, rp.permission_key, ura.scope_type, ura.scope_id FROM user_role_assignments ura LEFT JOIN role_permissions rp ON rp.role_key = ura.role_key WHERE ura.user_id = ? ORDER BY ura.role_key, rp.permission_key",
        params: [userId]
      });
      return {
        userId,
        roles: [...new Set(rows.map((row) => row.role_key))],
        permissions: [...new Set(rows.map((row) => row.permission_key).filter(Boolean))],
        scopes: rows.filter((row) => row.scope_type).map((row) => ({ type: row.scope_type, id: row.scope_id }))
      };
    },
    hasPermission(context, permissionKey) {
      return context.permissions.includes(permissionKey);
    },
    async requirePermission(userId, permissionKey) {
      const context = await this.loadAuthorizationContext(userId);
      if (!this.hasPermission(context, permissionKey))
        throw new PermissionDeniedError(permissionKey);
      return context;
    }
  };
}
