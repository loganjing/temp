import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(_app: Hono, _platform: Awaited<ReturnType<typeof initializePlatform>>) {}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(_app: Hono, _platform: Awaited<ReturnType<typeof initializePlatform>>) {}
