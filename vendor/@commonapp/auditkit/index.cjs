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
  createAuditKit: () => createAuditKit
});
module.exports = __toCommonJS(exports_src);
var import_node_crypto = require("node:crypto");
var stringify = (value) => JSON.stringify(value, (key, item) => /password|token|secret|hash/i.test(key) ? "[REDACTED]" : item);
function createAuditKit(db, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? import_node_crypto.randomUUID;
  return {
    async log(entry) {
      await db.run({
        text: "INSERT INTO audit_events (id, occurred_at, event_type, request_id, actor_user_id, channel, method, route, status_code, reason, duration_ms, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          createId(),
          entry.ts ?? now(),
          "auth.request",
          entry.requestId ?? null,
          entry.localUser?.id ?? null,
          entry.channel ?? null,
          entry.method ?? null,
          entry.route ?? null,
          entry.statusCode ?? null,
          entry.failReason ?? null,
          entry.durationMs ?? null,
          stringify({ extUser: entry.extUser, localUser: entry.localUser, paramDigest: entry.paramDigest })
        ]
      });
    },
    async record(event) {
      if (!event || typeof event.type !== "string" || !event.type)
        throw new TypeError("Audit event type is required");
      await db.run({
        text: "INSERT INTO audit_events (id, occurred_at, event_type, request_id, actor_user_id, channel, method, route, status_code, reason, duration_ms, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [createId(), event.occurredAt ?? now(), event.type, event.requestId ?? null, event.actorUserId ?? null, event.channel ?? null, event.method ?? null, event.route ?? null, event.statusCode ?? null, event.reason ?? null, event.durationMs ?? null, stringify(event.metadata ?? {})]
      });
    },
    async list({ actorUserId, eventType, limit = 50, offset = 0 } = {}) {
      const rows = await db.queryAll({
        text: "SELECT id, occurred_at, event_type, request_id, actor_user_id, channel, method, route, status_code, reason, duration_ms, metadata_json FROM audit_events WHERE (? IS NULL OR actor_user_id = ?) AND (? IS NULL OR event_type = ?) ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?",
        params: [actorUserId ?? null, actorUserId ?? null, eventType ?? null, eventType ?? null, Math.min(Math.max(Number(limit) || 50, 1), 100), Math.max(Number(offset) || 0, 0)]
      });
      return rows.map((row) => ({ id: row.id, occurredAt: row.occurred_at, type: row.event_type, requestId: row.request_id, actorUserId: row.actor_user_id, channel: row.channel, method: row.method, route: row.route, statusCode: row.status_code, reason: row.reason, durationMs: row.duration_ms, metadata: JSON.parse(row.metadata_json ?? "{}") }));
    }
  };
}
