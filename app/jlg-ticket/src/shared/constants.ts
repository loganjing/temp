// Platform-neutral constants and enums shared by server and client.

export const TICKET_STATUS = {
  CREATED: 'created',
  PENDING_ASSIGN: 'pending_assign',
  PENDING_PROCESS: 'pending_process',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS]

export const SLA_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type SlaPriority = (typeof SLA_PRIORITIES)[number]

export function isSlaPriority(value: string): value is SlaPriority {
  return (SLA_PRIORITIES as readonly string[]).includes(value)
}
