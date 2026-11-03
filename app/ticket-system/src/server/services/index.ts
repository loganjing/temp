import type { initializePlatform } from '../platform/bootstrap'
import { createTicketService } from './ticket-service'
import { createOrgService } from './org-service'
import { createQueryService } from './query-service'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

export function createServices(platform: Platform) {
  return {
    ticket: createTicketService({ db: platform.db, auditKit: platform.auditKit, emailClient: platform.emailClient }),
    org: createOrgService(platform.db),
    query: createQueryService({ db: platform.db, auditKit: platform.auditKit }),
  }
}

export type Services = ReturnType<typeof createServices>
