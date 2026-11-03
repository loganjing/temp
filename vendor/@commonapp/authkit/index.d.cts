import * as hono from 'hono';
import { MiddlewareHandler, Context } from 'hono';

/**
 * 字段映射对：灵基/OAuth userinfo 中的字段 → 本地 users 表字段
 * 因为外部返回的字段名可能与本地表字段名不同
 * 例如：灵基 username → 本地 user_code
 */
interface MatchFieldMapping {
    /** 外部 userinfo 中的字段名（如 phone / username） */
    externalField: string;
    /** 本地 users 表的字段名（如 phone / user_code） */
    localField: string;
}
interface AuthKitConfig {
    jwtSecret: string;
    tokenTtlMs?: number;
    /** 管理员角色标识，默认 'admin' */
    adminRole?: string;
    /** 活跃用户状态标识，默认 'active' */
    activeStatus?: string;
    /** 多字段映射，按顺序匹配，第一个匹配成功的用户即返回 */
    matchFields?: MatchFieldMapping[];
    lingeeConsoleUrl?: string;
    lingeeTenantCodeWhitelist?: string[];
    lingeeVerifyCacheTtlMs?: number;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthAuthorizeUrl?: string;
    oauthTokenUrl?: string;
    oauthUserinfoUrl?: string;
    oauthRedirectUri?: string;
    oauthStateTtlMs?: number;
    ssoTicketTtlMs?: number;
    appKey?: string;
    frontendUrl?: string;
    /** SSO callback 路径，默认 '/api/auth/sso/callback' */
    ssoCallbackPath?: string;
    /** SSO start 路径，默认 '/api/auth/sso/start' */
    ssoStartPath?: string;
    /** SSO exchange 路径，默认 '/api/auth/sso/exchange' */
    ssoExchangePath?: string;
    /** 密码登录路由路径，默认 '/api/auth/login' */
    loginRoutePath?: string;
    /** SSO 失败后跳转的前端路径，默认 '/login' */
    loginPath?: string;
    /** SSO 成功后跳转的前端路径模板，默认 '/?token={token}' */
    tokenRedirectPath?: string;
}
/**
 * 解析多字段映射配置字符串
 * 格式："externalField:localField,externalField:localField"
 * 例如："phone:phone,username:user_code"
 * - 先匹配 phone:phone（外部 phone → 本地 phone）
 * - 再匹配 username:user_code（外部 username → 本地 user_code）
 *
 * 向后兼容：如果值不含冒号，视为外部字段名 = 本地字段名
 * 例如："phone" 等价于 "phone:phone"
 */
declare function parseMatchFields(raw: string): MatchFieldMapping[];
/** 从环境变量构建配置 */
declare function loadConfigFromEnv(): AuthKitConfig;
/** 启动校验 — 生产环境 jwtSecret 缺失/默认值时抛异常 */
declare function assertConfig(config: AuthKitConfig): void;

interface AppUser {
    id: string;
    role: string;
    status: string;
}
type AuthEnv<U extends AppUser = AppUser> = {
    Variables: {
        currentUser: U;
        authChannel: 'mcp' | 'web';
        lingeeIdentity?: LingeeUserInfo;
        requestId: string;
    };
};
interface UserResolver<U extends AppUser = AppUser> {
    /** 按字段查用户（如 phone / username / email） */
    findByField(field: string, value: string): Promise<U | null>;
    /** 按 ID 查用户 */
    findById(id: string): Promise<U | null>;
}
interface Cache {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttlMs: number): Promise<void>;
    delete(key: string): Promise<void>;
}
interface AuditEntry {
    ts: string;
    requestId: string;
    channel: 'mcp' | 'web';
    extUser?: Record<string, unknown>;
    localUser?: {
        id: string;
        role: string;
    };
    method: string;
    route: string;
    paramDigest?: string;
    statusCode: number;
    failReason?: string;
    durationMs?: number;
}
interface AuditLogger {
    log(entry: AuditEntry): Promise<void>;
}
interface TokenService {
    sign(userId: string): string;
    verify(token: string): {
        userId: string;
    } | null;
}
interface LingeeTokenExchange {
    accessToken: string;
    expiresAt: number;
    refreshToken: string;
    sysUserId: number;
    tenantId: number;
    userId: number;
    tenantCode: string;
    username: string;
    truename: string;
}
interface LingeeTokenVerify {
    valid: boolean;
    sysUserId?: number;
    tenantId?: number;
    userId?: number;
    message?: string;
}
interface LingeeUserInfo {
    sysUserId: number;
    tenantId: number;
    userId: number;
    tenantCode: string;
    username: string;
    truename: string;
    customerTid: string | null;
    phone: string | null;
    email: string | null;
}
interface CachedLingeeIdentity {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    identity: LingeeUserInfo;
    localUserId: string;
    lastVerifiedAt: number;
}
interface OAuthIdentity {
    sub: string;
    tenant_id: string;
    phone: string;
    display_name: string;
    username: string;
    email: string;
    role: string;
}
interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    tenant_id: string;
    user_id: string;
}
/** 带密码哈希的用户（密码登录路由需要） */
interface CredentialUser extends AppUser {
    passwordHash: string;
}
/** 密码哈希 + 校验接口 */
interface PasswordService {
    /** 密码哈希（存储时调用） */
    hash(password: string): string;
    /** 密码校验（登录时调用，常量时间比较） */
    verify(password: string, stored: string): boolean;
}
/** 密码登录路由选项 */
interface LoginRouteOptions<U extends CredentialUser> {
    /** 按登录标识（手机号/邮箱等）查用户，返回含 passwordHash 的完整用户 */
    findByCredential: (identifier: string) => Promise<U | null>;
    /** 请求体中登录标识的字段名，默认 'phone' */
    loginField?: string;
    /** 自定义响应体（默认返回 { token, user: { id, role, status } }） */
    responseTransform?: (user: U, token: string) => Record<string, unknown>;
}

interface TokenServiceOptions {
    secret: string;
    ttlMs?: number;
}
declare function createTokenService(opts: TokenServiceOptions): TokenService;

declare function createMemoryCache(): Cache;

/** console 审计日志器 — 仅输出非敏感摘要 */
declare function createConsoleAuditLogger(): AuditLogger;

interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    message?: string;
}
declare function createRateLimit(opts: RateLimitOptions): MiddlewareHandler;

interface LingeeAuthOptions<U extends AppUser> {
    consoleUrl: string;
    cache: Cache;
    config: AuthKitConfig;
    userResolver: UserResolver<U>;
    verifyCacheTtlMs?: number;
}
type LingeeAuthResult<U extends AppUser> = {
    ok: true;
    user: U;
    identity: LingeeUserInfo;
} | {
    ok: false;
    error: string;
    statusCode: number;
};
declare function verifyLingeeCode<U extends AppUser>(code: string, opts: LingeeAuthOptions<U>): Promise<LingeeAuthResult<U>>;

interface AuthMiddlewareOptions<U extends AppUser> {
    userResolver: UserResolver<U>;
    tokenService: TokenService;
    cache: Cache;
    config: AuthKitConfig;
    auditLogger?: AuditLogger;
    /** 密码服务（可注入，不传用默认 scrypt 实现） */
    passwordService?: PasswordService;
}
interface AuthMiddleware<U extends AppUser> {
    /** 组合认证：x-lingee-code(MCP) 或 Bearer(Web)，互斥 */
    requireAnyAuth: MiddlewareHandler<AuthEnv<U>>;
    /** 管理员校验，串联在 requireAnyAuth 之后 */
    requireAdmin: MiddlewareHandler<AuthEnv<U>>;
    /** 仅灵基 MCP 通道认证 */
    lingeeAuth: MiddlewareHandler<AuthEnv<U>>;
    /** 仅 Web 会话认证 */
    webAuth: MiddlewareHandler<AuthEnv<U>>;
    /** 密码登录路由工厂 */
    createLoginRoute: <L extends CredentialUser>(opts: LoginRouteOptions<L>) => MiddlewareHandler;
    /** 密码哈希 */
    hashPassword: (password: string) => string;
    /** 密码校验 */
    verifyPassword: (password: string, stored: string) => boolean;
}
declare function createAuthMiddleware<U extends AppUser>(opts: AuthMiddlewareOptions<U>): AuthMiddleware<U>;

interface SsoRouteOptions<U extends AppUser> {
    userResolver: UserResolver<U>;
    tokenService: TokenService;
    cache: Cache;
    config: AuthKitConfig;
    auditLogger?: AuditLogger;
}
interface SsoRoutes {
    start: (c: Context) => Promise<Response>;
    callback: (c: Context) => Promise<Response>;
    exchange: (c: Context) => Promise<Response>;
}
declare function createSsoRoutes<U extends AppUser>(opts: SsoRouteOptions<U>): SsoRoutes;

interface AuthSetupOptions<U extends AppUser> {
    /** 应用实现的 UserResolver（查本地 users 表） */
    userResolver: UserResolver<U>;
    /** 可选配置，不传则从环境变量自动读取 */
    config?: AuthKitConfig;
    /** 可选审计日志器，不传用默认 console 输出 */
    auditLogger?: AuditLogger;
    /** 可选密码服务，不传用默认 scrypt 实现（已有存量库用 bcrypt/argon2 等时注入） */
    passwordService?: PasswordService;
    /** 限流配置，默认 60s 内最多 10 次 */
    rateLimit?: {
        windowMs?: number;
        maxRequests?: number;
        message?: string;
    };
}
interface AuthSetup<U extends AppUser> {
    /** 统一认证中间件（MCP x-lingee-code + Web Bearer token，互斥分流） */
    requireAnyAuth: MiddlewareHandler<AuthEnv<U>>;
    /** 管理员校验（串联在 requireAnyAuth 之后） */
    requireAdmin: MiddlewareHandler<AuthEnv<U>>;
    /** SSO 路由（start / callback / exchange） */
    sso: SsoRoutes;
    /** HMAC token 签发（登录成功后调用） */
    signToken: (userId: string) => string;
    /** 登录限流中间件 */
    loginRateLimit: MiddlewareHandler;
    /** 密码哈希（scrypt + 盐） */
    hashPassword: (password: string) => string;
    /** 密码校验（常量时间比较） */
    verifyPassword: (password: string, stored: string) => boolean;
    /** 密码登录路由工厂（传入 findByCredential 即可生成登录路由） */
    createLoginRoute: <L extends CredentialUser>(opts: LoginRouteOptions<L>) => MiddlewareHandler;
    /** 已加载的配置（供应用读取 adminRole / activeStatus 等） */
    config: AuthKitConfig;
}
declare function createAuth<U extends AppUser>(opts: AuthSetupOptions<U>): AuthSetup<U>;

/** 密码哈希：scrypt + 16 字节随机盐，格式 `salt:hash` */
declare function hashPassword(password: string): string;
/** 密码校验：常量时间比较，防时序攻击 */
declare function verifyPassword(password: string, stored: string): boolean;
/** 默认密码服务（scrypt 实现），应用不注入 passwordService 时使用 */
declare const defaultPasswordService: PasswordService;

/** 脱敏：取 hash 前8位作为追踪标识 */
declare function maskHash(fullHash: string): string;
/** 脱敏：token 显示 前4…后4 */
declare function maskToken(token: string): string;
/** 条件调试日志，统一前缀 [authkit] */
declare function dbg(tag: string, msg: string, ...args: unknown[]): void;
/** 调试是否开启 */
declare function isDebug(): boolean;

declare const ErrNotAuthenticated: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrAmbiguousCredentials: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrInvalidLingeeCode: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrIdentityServiceUnavailable: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrTokenRevoked: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrTokenInvalid: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrAccountDisabled: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrSessionExpired: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrUserNotRegistered: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrTenantNotAllowed: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrInvalidAppKey: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrInsufficientPermissions: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrInvalidState: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrStateExpired: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
declare const ErrInvalidSsoTicket: (c: Context) => Response & hono.TypedResponse<{
    error: string;
}, 429 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">;
type FailReason = 'auth_failed' | 'authz_failed' | 'business_error' | 'identity_service_error';
declare function classifyFailReason(status: number): FailReason | undefined;

export { type AppUser, type AuditEntry, type AuditLogger, type AuthEnv, type AuthKitConfig, type AuthMiddleware, type AuthMiddlewareOptions, type AuthSetup, type AuthSetupOptions, type Cache, type CachedLingeeIdentity, type CredentialUser, ErrAccountDisabled, ErrAmbiguousCredentials, ErrIdentityServiceUnavailable, ErrInsufficientPermissions, ErrInvalidAppKey, ErrInvalidLingeeCode, ErrInvalidSsoTicket, ErrInvalidState, ErrNotAuthenticated, ErrSessionExpired, ErrStateExpired, ErrTenantNotAllowed, ErrTokenInvalid, ErrTokenRevoked, ErrUserNotRegistered, type FailReason, type LingeeAuthOptions, type LingeeAuthResult, type LingeeTokenExchange, type LingeeTokenVerify, type LingeeUserInfo, type LoginRouteOptions, type MatchFieldMapping, type OAuthIdentity, type OAuthTokenResponse, type PasswordService, type RateLimitOptions, type SsoRouteOptions, type SsoRoutes, type TokenService, type TokenServiceOptions, type UserResolver, assertConfig, classifyFailReason, createAuth, createAuthMiddleware, createConsoleAuditLogger, createMemoryCache, createRateLimit, createSsoRoutes, createTokenService, dbg, defaultPasswordService, hashPassword, isDebug, loadConfigFromEnv, maskHash, maskToken, parseMatchFields, verifyLingeeCode, verifyPassword };
