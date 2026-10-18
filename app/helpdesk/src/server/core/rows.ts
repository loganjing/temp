// Shared DB row shapes for the ticket domain.
import type { Priority, Role, TicketStatus } from '../../shared/domain'

export interface TicketRow {
  id: number
  ticket_no: string | null
  subject_zh: string
  subject_en: string | null
  description: string
  category_id: number
  sub_category_id: number | null
  priority: Priority
  status: TicketStatus
  requester_id: number
  assignee_id: number | null
  team_id: number | null
  department_id: number | null
  idempotency_key: string | null
  submit_idempotency_key: string | null
  submitted_at: string | null
  first_response_at: string | null
  resolution_start_at: string | null
  resolved_at: string | null
  closed_at: string | null
  sla_first_response_deadline: string | null
  sla_resolution_deadline: string | null
  created_at: string
  updated_at: string
}

export interface ReplyRow {
  id: number
  ticket_id: number
  author_id: number
  body: string
  kind: 'normal' | 'resolution' | 'rejection'
  created_at: string
}

export interface ActivityRow {
  id: number
  ticket_id: number
  actor_id: number | null
  action: string
  from_status: TicketStatus | null
  to_status: TicketStatus | null
  field_changes: string | null
  remark_zh: string
  remark_en: string
  source: 'user' | 'system' | 'mcp'
  created_at: string
}

export interface RatingRow {
  id: number
  ticket_id: number
  score: number
  comment: string | null
  is_system_default: number
  created_at: string
}

export interface CategoryRow {
  id: number
  code: string
  name_zh: string
  name_en: string
  department_id: number | null
  ticket_type: 'service_request' | 'incident'
  sort_order: number
  status: number
  is_skeleton: number
}

export interface SlaPolicyRow {
  id: number
  category_id: number
  first_response_minutes: number
  resolution_minutes: number
  warn_threshold_percent: number
}

export interface CompanyRow {
  id: number
  code: string
  name_zh: string
  name_en: string
  parent_id: number | null
  status: number
}

export interface DepartmentRow {
  id: number
  code: string
  name_zh: string
  name_en: string
  assign_mode: 'auto' | 'manual'
  status: number
}

export interface TeamRow {
  id: number
  department_id: number
  code: string
  name_zh: string
  name_en: string
  status: number
}

export interface BizUserRow {
  id: number
  credential_user_id: string
  name_zh: string
  name_en: string
  email: string
  phone: string | null
  role: Role
  company_id: number | null
  status: number
}

export interface VacationRow {
  id: number
  user_id: number
  start_date: string
  end_date: string
  auto_reply_text: string | null
  created_at: string
}

export interface AttachmentRow {
  id: string
  entity_id: string
  name: string
  size: number
  mime_type: string
  path: string
  uploaded_at: string
  uploaded_by_id: string
  uploaded_by_name: string
  source?: string
}
