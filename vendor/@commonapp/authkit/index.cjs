"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ErrAccountDisabled: () => ErrAccountDisabled,
  ErrAmbiguousCredentials: () => ErrAmbiguousCredentials,
  ErrIdentityServiceUnavailable: () => ErrIdentityServiceUnavailable,
  ErrInsufficientPermissions: () => ErrInsufficientPermissions,
  ErrInvalidAppKey: () => ErrInvalidAppKey,
  ErrInvalidLingeeCode: () => ErrInvalidLingeeCode,
  ErrInvalidSsoTicket: () => ErrInvalidSsoTicket,
  ErrInvalidState: () => ErrInvalidState,
  ErrNotAuthenticated: () => ErrNotAuthenticated,
  ErrSessionExpired: () => ErrSessionExpired,
  ErrStateExpired: () => ErrStateExpired,
  ErrTenantNotAllowed: () => ErrTenantNotAllowed,
  ErrTokenInvalid: () => ErrTokenInvalid,
  ErrTokenRevoked: () => ErrTokenRevoked,
  ErrUserNotRegistered: () => ErrUserNotRegistered,
  assertConfig: () => assertConfig,
  classifyFailReason: () => classifyFailReason,
  createAuth: () => createAuth,
  createAuthMiddleware: () => createAuthMiddleware,
  createConsoleAuditLogger: () => createConsoleAuditLogger,
  createMemoryCache: () => createMemoryCache,
  createRateLimit: () => createRateLimit,
  createSsoRoutes: () => createSsoRoutes,
  createTokenService: () => createTokenService,
  dbg: () => dbg,
  defaultPasswordService: () => defaultPasswordService,
  hashPassword: () => hashPassword,
  isDebug: () => isDebug,
  loadConfigFromEnv: () => loadConfigFromEnv,
  maskHash: () => maskHash,
  maskToken: () => maskToken,
  parseMatchFields: () => parseMatchFields,
  verifyLingeeCode: () => verifyLingeeCode,
  verifyPassword: () => verifyPassword
});
module.exports = __toCommonJS(index_exports);

// src/config.ts
var DEFAULT_JWT_SECRET = "authkit-dev-secret-change-in-prod";
var DEFAULT_TOKEN_TTL = 7 * 24 * 60 * 60 * 1e3;
var DEFAULT_VERIFY_CACHE_TTL = 3e4;
var DEFAULT_STATE_TTL = 3e5;
var DEFAULT_SSO_TICKET_TTL = 3e4;
function parseMatchFields(raw) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((pair) => {
    const [externalField, localField] = pair.split(":").map((s) => s.trim());
    return {
      externalField: externalField ?? pair,
      localField: localField ?? externalField ?? pair
    };
  });
}
function resolveMatchFields(env, defaultField = "phone") {
  if (env) return parseMatchFields(env);
  return [{ externalField: defaultField, localField: defaultField }];
}
function loadConfigFromEnv() {
  const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  const lingeeTenantCode = process.env.LINGEE_TENANT_CODE;
  const kworkBaseUrl = process.env.KWORK_BASE_URL;
  return {
    jwtSecret,
    tokenTtlMs: DEFAULT_TOKEN_TTL,
    adminRole: process.env.ADMIN_ROLE ?? "admin",
    activeStatus: process.env.ACTIVE_STATUS ?? "active",
    lingeeConsoleUrl: process.env.LINGEE_CONSOLE_URL,
    matchFields: resolveMatchFields(process.env.MATCH_FIELDS),
    lingeeTenantCodeWhitelist: lingeeTenantCode ? lingeeTenantCode.split(",").map((s) => s.trim()) : void 0,
    lingeeVerifyCacheTtlMs: DEFAULT_VERIFY_CACHE_TTL,
    oauthClientId: process.env.OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.OAUTH_CLIENT_SECRET,
    // 3 个 URL 优先用单独配置，未配则从 KWORK_BASE_URL 自动推导
    oauthAuthorizeUrl: process.env.OAUTH_AUTHORIZE_URL ?? (kworkBaseUrl ? `${kworkBaseUrl}/oauth2/authorize` : void 0),
    oauthTokenUrl: process.env.OAUTH_TOKEN_URL ?? (kworkBaseUrl ? `${kworkBaseUrl}/oauth2/token` : void 0),
    oauthUserinfoUrl: process.env.OAUTH_USERINFO_URL ?? (kworkBaseUrl ? `${kworkBaseUrl}/oauth2/userinfo` : void 0),
    oauthRedirectUri: process.env.OAUTH_REDIRECT_URI,
    oauthStateTtlMs: DEFAULT_STATE_TTL,
    ssoTicketTtlMs: DEFAULT_SSO_TICKET_TTL,
    appKey: process.env.APP_KEY,
    // SSO 前端地址从 CORS_ORIGIN 取，运行时 resolveFrontendUrl 用 X-Forwarded-Proto 确保 https
    frontendUrl: process.env.CORS_ORIGIN?.split(",")?.[0]?.trim(),
    // 路由路径（可配置，新应用可覆盖）
    ssoCallbackPath: process.env.SSO_CALLBACK_PATH ?? "/api/auth/sso/callback",
    ssoStartPath: process.env.SSO_START_PATH ?? "/api/auth/sso/start",
    ssoExchangePath: process.env.SSO_EXCHANGE_PATH ?? "/api/auth/sso/exchange",
    loginRoutePath: process.env.LOGIN_ROUTE_PATH ?? "/api/auth/login",
    loginPath: process.env.LOGIN_PATH ?? "/login",
    tokenRedirectPath: process.env.TOKEN_REDIRECT_PATH ?? "/?token={token}"
  };
}
function assertConfig(config) {
  const isProd = process.env.NODE_ENV === "production";
  if (!config.jwtSecret || config.jwtSecret === DEFAULT_JWT_SECRET) {
    if (isProd) {
      throw new Error("[authkit] JWT_SECRET must be set to a non-default value in production");
    }
    console.warn("[authkit] WARNING: JWT_SECRET is using default value \u2014 do not use in production");
  }
}

// src/token.ts
var import_node_crypto = require("crypto");
function createTokenService(opts) {
  const secret = opts.secret;
  const ttlMs = opts.ttlMs ?? 7 * 24 * 60 * 60 * 1e3;
  return {
    sign(userId) {
      const payload = { userId, iat: Date.now(), exp: Date.now() + ttlMs };
      const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = (0, import_node_crypto.createHmac)("sha256", secret).update(data).digest("base64url");
      return `${data}.${sig}`;
    },
    verify(token) {
      const [data, sig] = token.split(".");
      if (!data || !sig) return null;
      const expectedSig = (0, import_node_crypto.createHmac)("sha256", secret).update(data).digest("base64url");
      if (sig.length !== expectedSig.length) return null;
      if (!(0, import_node_crypto.timingSafeEqual)(Buffer.from(sig), Buffer.from(expectedSig))) return null;
      try {
        const payload = JSON.parse(Buffer.from(data, "base64url").toString());
        if (payload.exp && payload.exp < Date.now()) return null;
        return { userId: payload.userId };
      } catch {
        return null;
      }
    }
  };
}

// src/debug.ts
var DEBUG = process.env.DEBUG_AUTHKIT === "true" || process.env.DEBUG_AUTHKIT === "1";
function maskHash(fullHash) {
  return fullHash.slice(0, 8);
}
function maskToken(token) {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 4)}\u2026${token.slice(-4)}`;
}
function dbg(tag, msg, ...args) {
  if (!DEBUG) return;
  const ts = (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
  const parts = args.length > 0 ? ` ${args.map(
    (a) => typeof a === "string" ? a : JSON.stringify(a)
  ).join(" ")}` : "";
  console.log(`[authkit ${ts}] ${tag} ${msg}${parts}`);
}
function isDebug() {
  return DEBUG;
}

// src/cache.ts
function createMemoryCache() {
  const store = /* @__PURE__ */ new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) dbg("cache", `\u5B9A\u671F\u6E05\u7406 ${cleaned} \u6761\u8FC7\u671F\u6761\u76EE`);
  }, 6e4);
  timer.unref?.();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) {
        dbg("cache", `GET ${key.slice(0, 20)} \u2192 MISS`);
        return void 0;
      }
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        dbg("cache", `GET ${key.slice(0, 20)} \u2192 EXPIRED \u5DF2\u5220\u9664`);
        return void 0;
      }
      dbg("cache", `GET ${key.slice(0, 20)} \u2192 HIT`);
      return entry.value;
    },
    async set(key, value, ttlMs) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      dbg("cache", `SET ${key.slice(0, 20)} TTL=${ttlMs}ms`);
    },
    async delete(key) {
      store.delete(key);
      dbg("cache", `DEL ${key.slice(0, 20)}`);
    }
  };
}

// src/audit.ts
function createConsoleAuditLogger() {
  return {
    async log(entry) {
      const parts = [
        entry.ts,
        `[${entry.channel}]`,
        entry.localUser ? `user=${entry.localUser.id}(${entry.localUser.role})` : "user=anonymous",
        `${entry.method} ${entry.route}`,
        String(entry.statusCode),
        entry.failReason ?? ""
      ].filter(Boolean);
      console.log(`[audit] ${parts.join(" ")}`);
    }
  };
}

// src/rate-limit.ts
function createRateLimit(opts) {
  const requests = /* @__PURE__ */ new Map();
  const message = opts.message ?? "Too many requests, please try again later";
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of requests) {
      if (entry.resetTime <= now) requests.delete(key);
    }
  }, opts.windowMs);
  timer.unref?.();
  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();
    const entry = requests.get(key);
    if (!entry || entry.resetTime <= now) {
      requests.set(key, { count: 1, resetTime: now + opts.windowMs });
    } else {
      entry.count++;
      if (entry.count > opts.maxRequests) {
        return c.json({ error: message }, 429);
      }
    }
    await next();
  };
}

// src/lingee-auth.ts
var import_node_crypto2 = require("crypto");
var EXCHANGE_PATH = "/console/api/open/auth/token/exchange";
var VERIFY_PATH = "/console/api/open/auth/token/verify";
var USERINFO_PATH = "/console/api/open/auth/token/userinfo";
var REFRESH_PATH = "/console/api/open/auth/token/refresh";
async function callExchange(consoleUrl, code) {
  const codeHash = (0, import_node_crypto2.createHash)("sha256").update(code).digest("hex").slice(0, 8);
  dbg("exchange", `POST ${consoleUrl}${EXCHANGE_PATH} code=${codeHash}\u2026`);
  try {
    const res = await fetch(`${consoleUrl}${EXCHANGE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (!res.ok) {
      dbg("exchange", `FAIL HTTP ${res.status} \u2014 code \u65E0\u6548\u6216\u8FC7\u671F`);
      return null;
    }
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      dbg("exchange", `FAIL biz code=${json.code} \u2014 Console \u4E1A\u52A1\u5C42\u62D2\u7EDD`);
      return null;
    }
    dbg("exchange", `OK sysUserId=${json.data.sysUserId} tenantId=${json.data.tenantId} token=${maskToken(json.data.accessToken)}`);
    return json.data;
  } catch (err) {
    dbg("exchange", `NETWORK ERROR \u2014 ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function callVerify(consoleUrl, accessToken) {
  dbg("verify", `POST ${consoleUrl}${VERIFY_PATH} token=${maskToken(accessToken)}`);
  try {
    const res = await fetch(`${consoleUrl}${VERIFY_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: accessToken })
    });
    if (!res.ok) {
      dbg("verify", `FAIL HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      dbg("verify", `FAIL biz code=${json.code}`);
      return null;
    }
    dbg("verify", `OK valid=${json.data.valid}`);
    return json.data;
  } catch (err) {
    dbg("verify", `NETWORK ERROR \u2014 ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function callUserinfo(consoleUrl, accessToken) {
  dbg("userinfo", `GET ${consoleUrl}${USERINFO_PATH} token=${maskToken(accessToken)}`);
  try {
    const res = await fetch(`${consoleUrl}${USERINFO_PATH}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      dbg("userinfo", `FAIL HTTP ${res.status} \u2014 token \u65E0\u6548`);
      return null;
    }
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      dbg("userinfo", `FAIL biz code=${json.code}`);
      return null;
    }
    dbg("userinfo", `OK tenantCode=${json.data.tenantCode} username=${json.data.username} truename=${json.data.truename} phone=${json.data.phone ?? "null"}`);
    return json.data;
  } catch (err) {
    dbg("userinfo", `NETWORK ERROR \u2014 ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function callRefresh(consoleUrl, refreshToken) {
  dbg("refresh", `POST ${consoleUrl}${REFRESH_PATH} token=${maskToken(refreshToken)}`);
  try {
    const res = await fetch(`${consoleUrl}${REFRESH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) {
      dbg("refresh", `FAIL HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      dbg("refresh", `FAIL biz code=${json.code}`);
      return null;
    }
    dbg("refresh", `OK newToken=${maskToken(json.data.accessToken)} expiresAt=${json.data.expiresAt}`);
    return json.data;
  } catch (err) {
    dbg("refresh", `NETWORK ERROR \u2014 ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function verifyLingeeCode(code, opts) {
  const codeHash = (0, import_node_crypto2.createHash)("sha256").update(code).digest("hex");
  const cacheKey = `lingee:${codeHash}`;
  const verifyTtl = opts.verifyCacheTtlMs ?? 3e4;
  dbg("verify", `\u2500\u2500 verifyLingeeCode \u5F00\u59CB code=${maskHash(codeHash)} consoleUrl=${opts.consoleUrl}`);
  const cached = await opts.cache.get(cacheKey);
  if (cached) {
    dbg("verify", `\u7F13\u5B58\u547D\u4E2D localUserId=${cached.localUserId} token=${maskToken(cached.accessToken)}`);
    if (cached.expiresAt * 1e3 < Date.now()) {
      dbg("verify", `accessToken \u5DF2\u8FC7\u671F \u2192 \u5C1D\u8BD5 refresh`);
      const refreshResult = await callRefresh(opts.consoleUrl, cached.refreshToken);
      if (refreshResult) {
        cached.accessToken = refreshResult.accessToken;
        cached.refreshToken = refreshResult.refreshToken;
        cached.expiresAt = refreshResult.expiresAt;
        cached.lastVerifiedAt = Date.now();
        const remainingMs = Math.max(0, refreshResult.expiresAt * 1e3 - Date.now());
        await opts.cache.set(cacheKey, cached, remainingMs);
        dbg("verify", `refresh \u6210\u529F \u2192 \u7F13\u5B58\u5DF2\u66F4\u65B0`);
      } else {
        await opts.cache.delete(cacheKey);
        dbg("verify", `refresh \u5931\u8D25 \u2192 \u7F13\u5B58\u5220\u9664 \u2192 \u8FD4\u56DE 401 Token revoked`);
        return { ok: false, error: "Token revoked or expired", statusCode: 401 };
      }
    }
    if (Date.now() - cached.lastVerifiedAt > verifyTtl) {
      dbg("verify", `\u8DDD\u4E0A\u6B21 verify \u8D85\u8FC7 ${verifyTtl}ms \u2192 \u6309\u9700 verify`);
      const verifyResult = await callVerify(opts.consoleUrl, cached.accessToken);
      if (!verifyResult || !verifyResult.valid) {
        await opts.cache.delete(cacheKey);
        dbg("verify", `verify \u5931\u8D25 \u2192 \u7F13\u5B58\u5220\u9664 \u2192 \u8FD4\u56DE 401 Token revoked`);
        return { ok: false, error: "Token revoked or expired", statusCode: 401 };
      }
      cached.lastVerifiedAt = Date.now();
      const remainingMs = Math.max(0, cached.expiresAt * 1e3 - Date.now());
      await opts.cache.set(cacheKey, cached, remainingMs);
      dbg("verify", `verify \u6210\u529F \u2192 lastVerifiedAt \u5DF2\u66F4\u65B0`);
    }
    const user2 = await opts.userResolver.findById(cached.localUserId);
    if (!user2 || user2.status !== (opts.config.activeStatus ?? "active")) {
      dbg("verify", `\u672C\u5730\u7528\u6237 ${cached.localUserId} \u4E0D\u5B58\u5728\u6216 disabled \u2192 \u8FD4\u56DE 401`);
      return { ok: false, error: "Account disabled", statusCode: 401 };
    }
    dbg("verify", `\u2500\u2500 \u7F13\u5B58\u8DEF\u5F84\u5B8C\u6210 \u2192 \u8BA4\u8BC1\u6210\u529F user=${user2.id}(${user2.role})`);
    return { ok: true, user: user2, identity: cached.identity };
  }
  dbg("verify", `\u7F13\u5B58\u672A\u547D\u4E2D \u2192 \u9996\u6B21\u8BA4\u8BC1\u6D41\u7A0B`);
  const exchangeResult = await callExchange(opts.consoleUrl, code);
  if (!exchangeResult) {
    dbg("verify", `exchange \u5931\u8D25 \u2192 \u8FD4\u56DE 401 Invalid lingee code`);
    return { ok: false, error: "Invalid lingee code", statusCode: 401 };
  }
  const userInfo = await callUserinfo(opts.consoleUrl, exchangeResult.accessToken);
  if (!userInfo) {
    dbg("verify", `userinfo \u5931\u8D25 \u2192 \u8FD4\u56DE 401 Token invalid`);
    return { ok: false, error: "Token invalid", statusCode: 401 };
  }
  if (opts.config.lingeeTenantCodeWhitelist && opts.config.lingeeTenantCodeWhitelist.length > 0 && !opts.config.lingeeTenantCodeWhitelist.includes(userInfo.tenantCode)) {
    dbg("verify", `\u79DF\u6237 ${userInfo.tenantCode} \u4E0D\u5728\u767D\u540D\u5355 [${opts.config.lingeeTenantCodeWhitelist.join(",")}] \u2192 \u8FD4\u56DE 403`);
    return { ok: false, error: "Tenant not allowed", statusCode: 403 };
  }
  dbg("verify", `\u79DF\u6237\u6821\u9A8C\u901A\u8FC7 tenantCode=${userInfo.tenantCode}`);
  const matchFields = opts.config.matchFields ?? [{ externalField: "phone", localField: "phone" }];
  let user = null;
  for (const { externalField, localField } of matchFields) {
    const fieldValue = userInfo[externalField];
    if (!fieldValue) {
      dbg("verify", `\u8DF3\u8FC7 ${externalField}\u2192${localField}\uFF1Auserinfo \u4E2D\u4E3A null`);
      continue;
    }
    const found = await opts.userResolver.findByField(localField, fieldValue);
    if (found) {
      user = found;
      dbg("verify", `\u672C\u5730\u7528\u6237\u6620\u5C04\u6210\u529F ${externalField}\u2192${localField}=${fieldValue} \u2192 user=${found.id}(${found.role})`);
      break;
    }
    dbg("verify", `${externalField}\u2192${localField}=${fieldValue} \u672C\u5730\u65E0\u5339\u914D\u7528\u6237`);
  }
  if (!user) {
    dbg("verify", `\u6240\u6709\u5B57\u6BB5\u6620\u5C04\u5747\u672A\u5339\u914D \u2192 \u8FD4\u56DE 403 User not registered`);
    return { ok: false, error: "User not registered in this application", statusCode: 403 };
  }
  if (user.status !== (opts.config.activeStatus ?? "active")) {
    dbg("verify", `\u672C\u5730\u7528\u6237 ${user.id} status=${user.status} \u2192 \u8FD4\u56DE 401 Account disabled`);
    return { ok: false, error: "Account disabled", statusCode: 401 };
  }
  const cacheEntry = {
    accessToken: exchangeResult.accessToken,
    refreshToken: exchangeResult.refreshToken,
    expiresAt: exchangeResult.expiresAt,
    identity: userInfo,
    localUserId: user.id,
    lastVerifiedAt: Date.now()
  };
  const cacheTtl = Math.max(0, exchangeResult.expiresAt * 1e3 - Date.now());
  await opts.cache.set(cacheKey, cacheEntry, cacheTtl);
  dbg("verify", `\u7F13\u5B58\u5DF2\u5199\u5165 TTL=${cacheTtl}ms token=${maskToken(exchangeResult.accessToken)}`);
  dbg("verify", `\u2500\u2500 \u9996\u6B21\u8BA4\u8BC1\u6D41\u7A0B\u5B8C\u6210 \u2192 \u8BA4\u8BC1\u6210\u529F user=${user.id}(${user.role})`);
  return { ok: true, user, identity: userInfo };
}

// src/middleware.ts
var import_node_crypto4 = require("crypto");

// src/password.ts
var import_node_crypto3 = require("crypto");
var KEY_LEN = 64;
function hashPassword(password) {
  const salt = (0, import_node_crypto3.randomBytes)(16).toString("hex");
  const hash = (0, import_node_crypto3.scryptSync)(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = (0, import_node_crypto3.scryptSync)(password, salt, KEY_LEN);
  if (hashBuf.length !== testBuf.length) return false;
  return (0, import_node_crypto3.timingSafeEqual)(hashBuf, testBuf);
}
var defaultPasswordService = {
  hash: hashPassword,
  verify: verifyPassword
};

// src/errors.ts
function jsonError(c, status, message) {
  return c.json({ error: message }, status);
}
var ErrNotAuthenticated = (c) => jsonError(c, 401, "Not authenticated");
var ErrAmbiguousCredentials = (c) => jsonError(c, 401, "Ambiguous credentials");
var ErrInvalidLingeeCode = (c) => jsonError(c, 401, "Invalid lingee code");
var ErrIdentityServiceUnavailable = (c) => jsonError(c, 401, "Identity service unavailable");
var ErrTokenRevoked = (c) => jsonError(c, 401, "Token revoked or expired");
var ErrTokenInvalid = (c) => jsonError(c, 401, "Token invalid");
var ErrAccountDisabled = (c) => jsonError(c, 401, "Account disabled");
var ErrSessionExpired = (c) => jsonError(c, 401, "Session expired, please log in again");
var ErrUserNotRegistered = (c) => jsonError(c, 403, "User not registered in this application");
var ErrTenantNotAllowed = (c) => jsonError(c, 403, "Tenant not allowed");
var ErrInvalidAppKey = (c) => jsonError(c, 403, "Invalid app key");
var ErrInsufficientPermissions = (c) => jsonError(c, 403, "Insufficient permissions, admin role required");
var ErrInvalidState = (c) => jsonError(c, 400, "Invalid state");
var ErrStateExpired = (c) => jsonError(c, 400, "State expired");
var ErrInvalidSsoTicket = (c) => jsonError(c, 400, "Invalid or expired SSO ticket");
function classifyFailReason(status) {
  if (status === 401) return "auth_failed";
  if (status === 403) return "authz_failed";
  if (status >= 500) return "identity_service_error";
  if (status >= 400) return "business_error";
  return void 0;
}

// src/middleware.ts
function createAuthMiddleware(opts) {
  const { userResolver, tokenService, cache, config, auditLogger } = opts;
  const passwordService = opts.passwordService ?? defaultPasswordService;
  async function audit(c, statusCode, channel, user, failReason) {
    if (!auditLogger) return;
    await auditLogger.log({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      requestId: c.get("requestId") ?? "-",
      channel,
      localUser: user ? { id: user.id, role: user.role } : void 0,
      method: c.req.method,
      route: c.req.path,
      statusCode,
      failReason: failReason ?? classifyFailReason(statusCode)
    });
  }
  const lingeeAuth = async (c, next) => {
    const code = c.req.header("x-lingee-code");
    dbg("lingeeAuth", `\u2500\u2500 MCP \u8BA4\u8BC1\u5F00\u59CB ${c.req.method} ${c.req.path}`);
    if (!code) {
      dbg("lingeeAuth", `FAIL \u7F3A\u5C11 x-lingee-code \u2192 401`);
      const res = ErrNotAuthenticated(c);
      await audit(c, 401, "mcp", void 0, "auth_failed");
      return res;
    }
    dbg("lingeeAuth", `x-lingee-code=${maskHash(code)}\u2026`);
    if (config.appKey) {
      const appKey = c.req.header("x-app-key");
      if (appKey !== config.appKey) {
        dbg("lingeeAuth", `FAIL x-app-key \u4E0D\u5339\u914D \u2192 403`);
        const res = ErrInvalidAppKey(c);
        await audit(c, 403, "mcp", void 0, "authz_failed");
        return res;
      }
      dbg("lingeeAuth", `x-app-key \u6821\u9A8C\u901A\u8FC7`);
    }
    if (!config.lingeeConsoleUrl) {
      dbg("lingeeAuth", `FAIL LINGEE_CONSOLE_URL \u672A\u914D\u7F6E \u2192 401`);
      const res = ErrNotAuthenticated(c);
      await audit(c, 401, "mcp", void 0, "auth_failed");
      return res;
    }
    const result = await verifyLingeeCode(code, {
      consoleUrl: config.lingeeConsoleUrl,
      cache,
      config,
      userResolver,
      verifyCacheTtlMs: config.lingeeVerifyCacheTtlMs
    });
    if (!result.ok) {
      dbg("lingeeAuth", `FAIL verifyLingeeCode \u2192 ${result.statusCode} ${result.error}`);
      const res = c.json({ error: result.error }, result.statusCode);
      await audit(c, result.statusCode, "mcp", void 0);
      return res;
    }
    dbg("lingeeAuth", `OK \u8BA4\u8BC1\u6210\u529F user=${result.user.id}(${result.user.role})`);
    c.set("currentUser", result.user);
    c.set("authChannel", "mcp");
    c.set("lingeeIdentity", result.identity);
    await next();
  };
  const webAuth = async (c, next) => {
    const auth = c.req.header("Authorization");
    dbg("webAuth", `\u2500\u2500 Web \u8BA4\u8BC1\u5F00\u59CB ${c.req.method} ${c.req.path}`);
    if (!auth || !auth.startsWith("Bearer ")) {
      dbg("webAuth", `FAIL \u7F3A\u5C11 Bearer token \u2192 401`);
      const res = ErrNotAuthenticated(c);
      await audit(c, 401, "web", void 0, "auth_failed");
      return res;
    }
    const token = auth.slice(7);
    const payload = tokenService.verify(token);
    if (!payload) {
      dbg("webAuth", `FAIL token \u9A8C\u7B7E\u5931\u8D25/\u8FC7\u671F \u2192 401`);
      const res = ErrSessionExpired(c);
      await audit(c, 401, "web", void 0, "auth_failed");
      return res;
    }
    const user = await userResolver.findById(payload.userId);
    if (!user || user.status !== (config.activeStatus ?? "active")) {
      dbg("webAuth", `FAIL \u7528\u6237 ${payload.userId} \u4E0D\u5B58\u5728\u6216 disabled \u2192 401`);
      const res = ErrAccountDisabled(c);
      await audit(c, 401, "web", user ?? void 0, "auth_failed");
      return res;
    }
    dbg("webAuth", `OK \u8BA4\u8BC1\u6210\u529F user=${user.id}(${user.role})`);
    c.set("currentUser", user);
    c.set("authChannel", "web");
    await next();
  };
  const requireAnyAuth = async (c, next) => {
    if (!c.get("requestId")) {
      c.set("requestId", (0, import_node_crypto4.randomBytes)(8).toString("hex"));
    }
    const hasLingeeCode = !!c.req.header("x-lingee-code");
    const hasBearer = c.req.header("Authorization")?.startsWith("Bearer ") ?? false;
    dbg("requireAnyAuth", `\u2500\u2500 ${c.req.method} ${c.req.path} lingeeCode=${hasLingeeCode} bearer=${hasBearer}`);
    if (hasLingeeCode && hasBearer) {
      dbg("requireAnyAuth", `FAIL x-lingee-code \u4E0E Bearer \u540C\u65F6\u5B58\u5728 \u2192 401 Ambiguous`);
      const res = ErrAmbiguousCredentials(c);
      await audit(c, 401, "mcp", void 0, "auth_failed");
      return res;
    }
    let channel = "web";
    let authError = null;
    if (hasLingeeCode) {
      channel = "mcp";
      dbg("requireAnyAuth", `\u5206\u6D41 \u2192 MCP \u901A\u9053`);
      if (config.appKey) {
        const appKey = c.req.header("x-app-key");
        if (appKey !== config.appKey) {
          dbg("requireAnyAuth", `FAIL x-app-key \u4E0D\u5339\u914D \u2192 403`);
          authError = { error: "Invalid app key", statusCode: 403 };
        }
      }
      if (!authError && !config.lingeeConsoleUrl) {
        dbg("requireAnyAuth", `FAIL LINGEE_CONSOLE_URL \u672A\u914D\u7F6E \u2192 401`);
        authError = { error: "Not authenticated", statusCode: 401 };
      }
      if (!authError) {
        const result = await verifyLingeeCode(c.req.header("x-lingee-code"), {
          consoleUrl: config.lingeeConsoleUrl,
          cache,
          config,
          userResolver,
          verifyCacheTtlMs: config.lingeeVerifyCacheTtlMs
        });
        if (!result.ok) {
          dbg("requireAnyAuth", `FAIL verifyLingeeCode \u2192 ${result.statusCode} ${result.error}`);
          authError = { error: result.error, statusCode: result.statusCode };
        } else {
          dbg("requireAnyAuth", `OK MCP \u8BA4\u8BC1\u6210\u529F user=${result.user.id}(${result.user.role})`);
          c.set("currentUser", result.user);
          c.set("authChannel", "mcp");
          c.set("lingeeIdentity", result.identity);
        }
      }
    } else if (hasBearer) {
      channel = "web";
      dbg("requireAnyAuth", `\u5206\u6D41 \u2192 Web \u901A\u9053`);
      const token = c.req.header("Authorization").slice(7);
      const payload = tokenService.verify(token);
      if (!payload) {
        dbg("requireAnyAuth", `FAIL token \u9A8C\u7B7E\u5931\u8D25/\u8FC7\u671F \u2192 401`);
        authError = { error: "Session expired, please log in again", statusCode: 401 };
      } else {
        const user = await userResolver.findById(payload.userId);
        if (!user || user.status !== (config.activeStatus ?? "active")) {
          dbg("requireAnyAuth", `FAIL \u7528\u6237 ${payload.userId} \u4E0D\u5B58\u5728\u6216 disabled \u2192 401`);
          authError = { error: "Account disabled", statusCode: 401 };
        } else {
          dbg("requireAnyAuth", `OK Web \u8BA4\u8BC1\u6210\u529F user=${user.id}(${user.role})`);
          c.set("currentUser", user);
          c.set("authChannel", "web");
        }
      }
    } else {
      dbg("requireAnyAuth", `FAIL \u65E0\u4EFB\u4F55\u8BA4\u8BC1\u51ED\u8BC1 \u2192 401`);
      authError = { error: "Not authenticated", statusCode: 401 };
    }
    if (authError) {
      const res = c.json({ error: authError.error }, authError.statusCode);
      await audit(c, authError.statusCode, channel, void 0);
      return res;
    }
    dbg("requireAnyAuth", `\u8BA4\u8BC1\u901A\u8FC7 \u2192 \u6267\u884C\u8DEF\u7531 handler`);
    await next();
    const status = c.res.status;
    dbg("requireAnyAuth", `\u8DEF\u7531\u5B8C\u6210 \u2192 ${status} (${channel})`);
    await audit(c, status, channel, c.get("currentUser"));
  };
  const requireAdmin = async (c, next) => {
    const adminRole = config.adminRole ?? "admin";
    const user = c.get("currentUser");
    if (!user || user.role !== adminRole) {
      dbg("requireAdmin", `FAIL user=${user?.id ?? "none"} role=${user?.role ?? "none"} \u2192 403`);
      const res = ErrInsufficientPermissions(c);
      await audit(c, 403, c.get("authChannel") ?? "web", user, "authz_failed");
      return res;
    }
    dbg("requireAdmin", `OK user=${user.id} \u662F\u7BA1\u7406\u5458`);
    await next();
  };
  function createLoginRoute(opts2) {
    const loginField = opts2.loginField ?? "phone";
    const activeStatus = config.activeStatus ?? "active";
    return async (c, next) => {
      const body = await c.req.json().catch(() => ({}));
      const identifier = body[loginField];
      const password = body.password;
      if (!identifier || !password) {
        return c.json({ error: `${loginField} and password are required` }, 400);
      }
      const user = await opts2.findByCredential(identifier);
      if (!user || !passwordService.verify(password, user.passwordHash)) {
        await audit(c, 401, "web", void 0, "auth_failed");
        return c.json({ error: `Invalid ${loginField} or password` }, 401);
      }
      if (user.status !== activeStatus) {
        await audit(c, 403, "web", user, "authz_failed");
        return c.json({ error: "Account disabled, please contact administrator" }, 403);
      }
      const token = tokenService.sign(user.id);
      await audit(c, 200, "web", user);
      if (opts2.responseTransform) {
        return c.json(opts2.responseTransform(user, token));
      }
      return c.json({ token, user: { id: user.id, role: user.role, status: user.status } });
    };
  }
  return { requireAnyAuth, requireAdmin, lingeeAuth, webAuth, createLoginRoute, hashPassword: passwordService.hash, verifyPassword: passwordService.verify };
}

// src/oauth-sso.ts
var import_node_crypto5 = require("crypto");
function createSsoRoutes(opts) {
  const { userResolver, tokenService, cache, config, auditLogger } = opts;
  async function audit(method, route, statusCode, failReason) {
    if (!auditLogger) return;
    await auditLogger.log({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      requestId: "-",
      channel: "web",
      method,
      route,
      statusCode,
      failReason
    });
  }
  function resolveOrigin(c) {
    const url = new URL(c.req.url);
    const forwardedProto = c.req.header("X-Forwarded-Proto");
    if (forwardedProto === "https") {
      return `https://${url.host}`;
    }
    return url.origin;
  }
  function resolveFrontendUrl(c) {
    if (config.frontendUrl) {
      const forwardedProto = c.req.header("X-Forwarded-Proto");
      if (forwardedProto === "https" && config.frontendUrl.startsWith("http://")) {
        return config.frontendUrl.replace(/^http:\/\//, "https://");
      }
      return config.frontendUrl;
    }
    return resolveOrigin(c);
  }
  function resolveRedirectUri(c) {
    if (config.oauthRedirectUri) return config.oauthRedirectUri;
    return `${resolveOrigin(c)}${config.ssoCallbackPath ?? "/api/auth/sso/callback"}`;
  }
  async function exchangeCodeForToken(code, redirectUri) {
    const tokenUrl = config.oauthTokenUrl;
    console.log("[sso] Step 1: Exchanging code for token \u2192", tokenUrl);
    console.log("[sso]   client_id:", config.oauthClientId);
    console.log("[sso]   redirect_uri:", redirectUri);
    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: config.oauthClientId ?? "",
        client_secret: config.oauthClientSecret ?? ""
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      console.log("[sso]   Token endpoint response status:", res.status);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[sso]   \u2717 Token exchange failed:", res.status, text);
        return null;
      }
      const data = await res.json();
      console.log("[sso]   \u2713 Token exchange success, access_token:", data.access_token?.slice(0, 20) + "...");
      return data;
    } catch (err) {
      console.error("[sso]   \u2717 Token exchange error:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }
  async function getUserinfo(accessToken) {
    const userinfoUrl = config.oauthUserinfoUrl;
    console.log("[sso] Step 2: Fetching userinfo \u2192", userinfoUrl);
    try {
      const res = await fetch(userinfoUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.log("[sso]   Userinfo endpoint response status:", res.status);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[sso]   \u2717 Userinfo failed:", res.status, text);
        return null;
      }
      const data = await res.json();
      console.log("[sso]   \u2713 Userinfo success:", { sub: data.sub, phone: data.phone, username: data.username, role: data.role });
      return data;
    } catch (err) {
      console.error("[sso]   \u2717 Userinfo error:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }
  async function start(c) {
    console.log("[sso] Start: generating state and redirecting to authorize");
    if (!config.oauthAuthorizeUrl || !config.oauthClientId) {
      console.error("[sso]   \u2717 SSO not configured (missing authorize_url or client_id)");
      await audit("GET", config.ssoStartPath ?? "/api/auth/sso/start", 500, "config_missing");
      return c.json({ error: "SSO not configured" }, 500);
    }
    const state = (0, import_node_crypto5.randomBytes)(32).toString("hex");
    const stateTtl = config.oauthStateTtlMs ?? 3e5;
    await cache.set(`sso:state:${state}`, { created: Date.now() }, stateTtl);
    const url = new URL(config.oauthAuthorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.oauthClientId);
    url.searchParams.set("redirect_uri", resolveRedirectUri(c));
    url.searchParams.set("state", state);
    console.log("[sso]   \u2192 Redirecting to:", url.toString());
    return c.redirect(url.toString(), 302);
  }
  async function callback(c) {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const frontendUrl = resolveFrontendUrl(c);
    const ssoCallbackPath = config.ssoCallbackPath ?? "/api/auth/sso/callback";
    const loginPath = config.loginPath ?? "/login";
    const tokenRedirect = config.tokenRedirectPath ?? "/?token={token}";
    const activeStatus = config.activeStatus ?? "active";
    console.log("[sso] Callback received:", {
      code: code ? code.slice(0, 10) + "..." : "null",
      state: state ?? "null"
    });
    if (state) {
      const stateKey = `sso:state:${state}`;
      const stateEntry = await cache.get(stateKey);
      if (stateEntry) {
        console.log("[sso]   State found in cache, consuming");
        await cache.delete(stateKey);
      } else {
        console.log("[sso]   State not in cache (static state from menu URL, skipping validation)");
      }
    }
    if (!code) {
      console.error("[sso]   \u2717 No code in callback");
      await audit("GET", ssoCallbackPath, 400, "auth_failed");
      return c.redirect(`${frontendUrl}${loginPath}?sso_error=no_code`, 302);
    }
    const tokenResp = await exchangeCodeForToken(code, resolveRedirectUri(c));
    if (!tokenResp) {
      await audit("GET", ssoCallbackPath, 401, "auth_failed");
      return c.redirect(`${frontendUrl}${loginPath}?sso_error=token_failed`, 302);
    }
    const oauthUser = await getUserinfo(tokenResp.access_token);
    if (!oauthUser) {
      await audit("GET", ssoCallbackPath, 401, "auth_failed");
      return c.redirect(`${frontendUrl}${loginPath}?sso_error=userinfo_failed`, 302);
    }
    const matchFields = config.matchFields ?? [{ externalField: "phone", localField: "phone" }];
    let user = null;
    for (const { externalField, localField } of matchFields) {
      const fieldValue = oauthUser[externalField];
      if (!fieldValue) {
        console.log(`[sso]   - \u8DF3\u8FC7 ${externalField}\u2192${localField}\uFF1Auserinfo \u4E2D\u4E3A null`);
        continue;
      }
      console.log("[sso] Step 3: User mapping:", { externalField, localField, fieldValue });
      const found = await userResolver.findByField(localField, fieldValue);
      if (found) {
        user = found;
        console.log("[sso]   User matched:", { id: found.id, role: found.role, status: found.status });
        break;
      }
      console.log(`[sso]   - ${externalField}\u2192${localField}=${fieldValue} \u672C\u5730\u65E0\u5339\u914D\u7528\u6237`);
    }
    if (!user) {
      console.error("[sso]   \u2717 All match fields exhausted, no local user found");
      await audit("GET", ssoCallbackPath, 403, "authz_failed");
      return c.redirect(`${frontendUrl}${loginPath}?sso_error=unbound`, 302);
    }
    if (user.status !== activeStatus) {
      console.error("[sso]   \u2717 User disabled:", user.id, "status:", user.status);
      await audit("GET", ssoCallbackPath, 401, "auth_failed");
      return c.redirect(`${frontendUrl}${loginPath}?sso_error=disabled`, 302);
    }
    const token = tokenService.sign(user.id);
    console.log("[sso] Step 4: Token signed for user:", user.id, "\u2192 redirect to:", `${frontendUrl}${tokenRedirect.replace("{token}", "...")}`);
    await audit("GET", ssoCallbackPath, 302);
    return c.redirect(`${frontendUrl}${tokenRedirect.replace("{token}", token)}`, 302);
  }
  async function exchange(c) {
    const body = await c.req.json().catch(() => ({}));
    const ticket = body.ticket;
    if (!ticket) {
      await audit("POST", config.ssoExchangePath ?? "/api/auth/sso/exchange", 400, "auth_failed");
      return ErrInvalidSsoTicket(c);
    }
    const ticketKey = `sso:ticket:${ticket}`;
    const ticketEntry = await cache.get(ticketKey);
    if (!ticketEntry) {
      await audit("POST", config.ssoExchangePath ?? "/api/auth/sso/exchange", 400, "auth_failed");
      return ErrInvalidSsoTicket(c);
    }
    await cache.delete(ticketKey);
    const token = tokenService.sign(ticketEntry.userId);
    await audit("POST", config.ssoExchangePath ?? "/api/auth/sso/exchange", 200);
    return c.json({ token });
  }
  return { start, callback, exchange };
}

// src/setup.ts
function createAuth(opts) {
  const config = opts.config ?? loadConfigFromEnv();
  assertConfig(config);
  const mcpOn = !!config.lingeeConsoleUrl;
  const ssoOn = !!(config.oauthClientId && config.oauthClientSecret);
  console.log(
    `[authkit] channels: web=on | mcp=${mcpOn ? "on" : "off (LINGEE_CONSOLE_URL not set)"} | sso=${ssoOn ? "on" : "off (OAUTH_CLIENT_* not set)"}`
  );
  const tokenService = createTokenService({
    secret: config.jwtSecret,
    ttlMs: config.tokenTtlMs
  });
  const cache = createMemoryCache();
  const auditLogger = opts.auditLogger ?? createConsoleAuditLogger();
  const mw = createAuthMiddleware({
    userResolver: opts.userResolver,
    tokenService,
    cache,
    config,
    auditLogger,
    passwordService: opts.passwordService
  });
  const sso = createSsoRoutes({
    userResolver: opts.userResolver,
    tokenService,
    cache,
    config,
    auditLogger
  });
  const rl = opts.rateLimit ?? {};
  const loginRateLimit = createRateLimit({
    windowMs: rl.windowMs ?? 6e4,
    maxRequests: rl.maxRequests ?? 10,
    message: rl.message ?? "Too many login attempts, please try again later"
  });
  return {
    requireAnyAuth: mw.requireAnyAuth,
    requireAdmin: mw.requireAdmin,
    sso,
    signToken: (userId) => tokenService.sign(userId),
    loginRateLimit,
    hashPassword: mw.hashPassword,
    verifyPassword: mw.verifyPassword,
    createLoginRoute: mw.createLoginRoute,
    config
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ErrAccountDisabled,
  ErrAmbiguousCredentials,
  ErrIdentityServiceUnavailable,
  ErrInsufficientPermissions,
  ErrInvalidAppKey,
  ErrInvalidLingeeCode,
  ErrInvalidSsoTicket,
  ErrInvalidState,
  ErrNotAuthenticated,
  ErrSessionExpired,
  ErrStateExpired,
  ErrTenantNotAllowed,
  ErrTokenInvalid,
  ErrTokenRevoked,
  ErrUserNotRegistered,
  assertConfig,
  classifyFailReason,
  createAuth,
  createAuthMiddleware,
  createConsoleAuditLogger,
  createMemoryCache,
  createRateLimit,
  createSsoRoutes,
  createTokenService,
  dbg,
  defaultPasswordService,
  hashPassword,
  isDebug,
  loadConfigFromEnv,
  maskHash,
  maskToken,
  parseMatchFields,
  verifyLingeeCode,
  verifyPassword
});
//# sourceMappingURL=index.cjs.map