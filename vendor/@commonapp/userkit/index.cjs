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
  createUserStore: () => createUserStore,
  createUserResolver: () => createUserResolver
});
module.exports = __toCommonJS(exports_src);
var import_node_crypto = require("node:crypto");
var normalizeEmail = (value) => value.trim().toLowerCase();
var normalizePhone = (value) => value?.trim() || null;
function createUserStore(db, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? import_node_crypto.randomUUID;
  const mapRow = (row) => row && {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    enabled: Boolean(row.enabled),
    companyId: row.company_id ?? null,
    passwordHash: row.password_hash,
    passwordChangeRequired: Boolean(row.password_change_required),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return {
    async findById(id) {
      return mapRow(await db.queryOne({
        text: "SELECT id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at FROM users WHERE id = ?",
        params: [id]
      }));
    },
    async findByField(field, value) {
      const columns = { email: "email", phone: "phone" };
      const column = columns[field];
      if (!column || !value)
        return null;
      const normalized = field === "email" ? normalizeEmail(value) : normalizePhone(value);
      if (!normalized)
        return null;
      return mapRow(await db.queryOne({
        text: `SELECT id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at FROM users WHERE ${column} = ?`,
        params: [normalized]
      }));
    },
    async findByCredential(identifier, field = "email") {
      const user = await this.findByField(field, identifier);
      return user?.enabled ? user : null;
    },
    async count({ search = "" } = {}) {
      if (!search.trim())
        return Number((await db.queryOne({ text: "SELECT COUNT(*) AS total FROM users" }))?.total ?? 0);
      const q = `%${search.trim().toLowerCase()}%`;
      return Number((await db.queryOne({ text: "SELECT COUNT(*) AS total FROM users WHERE lower(name) LIKE ? OR lower(email) LIKE ? OR lower(COALESCE(phone, '')) LIKE ?", params: [q, q, q] }))?.total ?? 0);
    },
    async create(input, passwordHash) {
      const createdAt = now();
      const user = {
        id: createId(),
        name: input.name.trim(),
        email: normalizeEmail(input.email),
        phone: normalizePhone(input.phone),
        enabled: input.enabled ?? true,
        companyId: input.companyId ?? null,
        passwordHash,
        passwordChangeRequired: input.passwordChangeRequired ?? false,
        createdAt,
        updatedAt: createdAt
      };
      await db.run({
        text: "INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [user.id, user.name, user.email, user.phone, user.enabled ? 1 : 0, user.companyId, user.passwordHash, user.passwordChangeRequired ? 1 : 0, user.createdAt, user.updatedAt]
      });
      return { ...user, passwordHash: undefined };
    },
    async list({ search = "", limit = 50, offset = 0 } = {}) {
      const q = `%${search.trim().toLowerCase()}%`;
      const rows = await db.queryAll({
        text: "SELECT id, name, email, phone, enabled, company_id, created_at, updated_at FROM users WHERE lower(name) LIKE ? OR lower(email) LIKE ? OR lower(COALESCE(phone, '')) LIKE ? ORDER BY name, id LIMIT ? OFFSET ?",
        params: [q, q, q, Math.min(Math.max(Number(limit) || 50, 1), 100), Math.max(Number(offset) || 0, 0)]
      });
      return rows.map((row) => ({ id: row.id, name: row.name, email: row.email, phone: row.phone ?? null, enabled: Boolean(row.enabled), companyId: row.company_id ?? null, createdAt: row.created_at, updatedAt: row.updated_at }));
    },
    async update(id, input) {
      const fields = ["name = ?", "email = ?", "phone = ?", "updated_at = ?"];
      const params = [input.name.trim(), normalizeEmail(input.email), normalizePhone(input.phone), now()];
      if (input.companyId !== undefined) {
        fields.splice(3, 0, "company_id = ?");
        params.splice(3, 0, input.companyId ?? null);
      }
      params.push(id);
      await db.run({ text: `UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params });
      return this.findById(id);
    },
    async setEnabled(id, enabled) {
      if (typeof enabled !== "boolean")
        throw new TypeError("enabled must be a boolean");
      const result = await db.run({ text: "UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?", params: [enabled ? 1 : 0, now(), id] });
      return result.changes === 1;
    },
    async updatePassword(id, passwordHash, passwordChangeRequired = false) {
      const result = await db.run({ text: "UPDATE users SET password_hash = ?, password_change_required = ?, updated_at = ? WHERE id = ?", params: [passwordHash, passwordChangeRequired ? 1 : 0, now(), id] });
      return result.changes === 1;
    }
  };
}
function createUserResolver(store, options = {}) {
  const activeStatus = options.activeStatus ?? "active";
  const disabledStatus = options.disabledStatus ?? "disabled";
  const map = async (user) => {
    if (!user)
      return null;
    const roles = options.getRoles ? await options.getRoles(user.id) : [];
    return {
      id: user.id,
      role: roles.includes("admin") ? "admin" : roles[0] ?? "user",
      status: user.enabled ? activeStatus : disabledStatus,
      name: user.name,
      email: user.email,
      phone: user.phone,
      companyId: user.companyId,
      roles,
      passwordChangeRequired: user.passwordChangeRequired
    };
  };
  return {
    async findById(id) {
      return map(await store.findById(id));
    },
    async findByField(field, value) {
      return map(await store.findByField(field, value));
    },
    async findByCredential(identifier, field = "email") {
      return store.findByCredential(identifier, field);
    }
  };
}
