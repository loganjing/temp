export type AuditEvent = {
  type: string
  occurredAt?: string
  requestId?: string
  actorUserId?: string
  channel?: string
  method?: string
  route?: string
  statusCode?: number
  reason?: string
  durationMs?: number
  metadata?: Record<string, unknown>
}
export function createAuditKit(db: unknown, options?: { now?: () => string; createId?: () => string }): {
  log(entry: { ts: string; requestId: string; channel: 'mcp' | 'web'; extUser?: Record<string, unknown>; localUser?: { id: string; role: string }; method: string; route: string; paramDigest?: string; statusCode: number; failReason?: string; durationMs?: number }): Promise<void>
  record(event: AuditEvent): Promise<void>
  list(options?: { actorUserId?: string; eventType?: string; limit?: number; offset?: number }): Promise<Array<AuditEvent & { id: string }>>
}
