/**
 * 访客系统跨端共享类型。
 *
 * 字段命名统一使用 camelCase，与 API JSON 字段名一致。
 * 字段级契约以 docs/wi-t1000396/technical-contract.md 为唯一来源。
 *
 * 本文件为平台中立契约，禁止依赖 Node、Hono、React 或数据库驱动。
 */

/** 访客申请状态 */
export type VisitorStatus = 'pending' | 'approved' | 'rejected'

/** POST /api/visitors 请求体 */
export interface CreateVisitorRequest {
  name: string
  phone: string
  idCard: string
  company: string
  visitReason: string
  hostName: string
  expectedVisitTime: string
  /** 访客照片 URL，选填 */
  photoUrl?: string | null
}

/** POST /api/visitors 成功响应（201） */
export interface VisitorCreateResponse {
  id: string
  name: string
  phone: string
  idCard: string
  company: string
  visitReason: string
  hostName: string
  expectedVisitTime: string
  photoUrl: string | null
  /** 固定为 "pending" */
  status: VisitorStatus
  createdAt: string
}

/** GET /api/visitors/:id 成功响应（200），完整详情 */
export interface VisitorDetail {
  id: string
  name: string
  phone: string
  idCard: string
  company: string
  visitReason: string
  hostName: string
  expectedVisitTime: string
  photoUrl: string | null
  status: VisitorStatus
  reviewComment: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

/** GET /api/visitors 列表摘要项 */
export interface VisitorListItem {
  id: string
  name: string
  phone: string
  company: string
  hostName: string
  expectedVisitTime: string
  status: VisitorStatus
  createdAt: string
}

/** GET /api/visitors 列表响应 */
export interface VisitorListResponse {
  items: VisitorListItem[]
  total: number
  page: number
  limit: number
}

/** POST /api/visitors/:id/approve|reject 请求体 */
export interface ReviewVisitorRequest {
  /** 审批意见，选填，最多 500 字符 */
  comment?: string | null
}

/** POST /api/visitors/:id/approve|reject 成功响应（200） */
export interface ReviewVisitorResponse {
  id: string
  status: VisitorStatus
  reviewComment: string | null
  reviewedAt: string
}

/** 统一 API 错误响应格式 */
export interface ApiError {
  error: { code: string; message: string }
}
