// 访客系统共享类型与校验常量。
// 本文件为 src/shared/ 的唯一写入产物，前端任务只读取不写入。
// 仅依赖平台中立的 TypeScript，不引入 Node/Hono/React/DOM 或数据库驱动。

export const VISITOR_STATUSES = ['pending', 'approved', 'rejected'] as const
export type VisitorStatus = (typeof VISITOR_STATUSES)[number]

// 必填字符串字段长度上限；与 technical-contract.md 第1节 POST 请求体校验规则一致。
export const VISITOR_FIELD_LIMITS = {
  name: 50,
  phone: 20,
  id_card: 32,
  company: 100,
  visit_reason: 500,
  host_person: 50,
  license_plate: 20,
} as const

// 预计到访时间 ISO 8601 校验：日期 + 时间，可选秒、小数秒与时区偏移。
export const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

// 访客登记记录实体（API 响应字段，字段名与数据库列名一致）。
export interface Visitor {
  id: number
  name: string
  phone: string
  id_card: string
  company: string
  visit_reason: string
  host_person: string
  expected_arrival_time: string
  license_plate: string | null
  status: VisitorStatus
  created_at: string
  updated_at: string
  reviewed_at: string | null
}

// POST /api/visitors 请求体。
export interface CreateVisitorBody {
  name: string
  phone: string
  id_card: string
  company: string
  visit_reason: string
  host_person: string
  expected_arrival_time: string
  license_plate?: string
}

// PATCH /api/visitors/:id/status 请求体；目标状态只能是 approved 或 rejected。
export interface UpdateVisitorStatusBody {
  status: Exclude<VisitorStatus, 'pending'>
}
