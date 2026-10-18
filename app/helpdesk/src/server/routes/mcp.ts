// MCP JSON-RPC 2.0 endpoint (contract §13), registered in the public area:
// it authenticates with the x-lingee-code header (authkit Lingee exchange)
// instead of a browser Bearer token. Only the create_ticket tool exists.
import type { Hono } from 'hono'
import type { Locale } from '../../shared/domain'
import { ApiError, authRequired } from '../core/errors'
import { message } from '../core/messages'
import { findBizUserByCredentialId, requestLocale, toSessionUser, type AppEnv, type SessionUser } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import { mcpCreateTicket, type CreateTicketArgs } from '../services/mcp'

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'helpdesk-mcp', version: '1.0.0' }

const CREATE_TICKET_TOOL = {
  name: 'create_ticket',
  description: 'Create and submit a helpdesk ticket on behalf of the Lingee agent user',
  inputSchema: {
    type: 'object',
    properties: {
      subjectZh: { type: 'string' },
      subjectEn: { type: 'string' },
      description: { type: 'string' },
      categoryId: { type: 'number' },
      subCategoryId: { type: 'number' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      attachmentUrl: { type: 'string' },
      attachmentUrls: { type: 'array', items: { type: 'string' } },
      idempotencyKey: { type: 'string' },
    },
    required: ['subjectZh', 'description', 'categoryId', 'priority', 'idempotencyKey'],
  },
}

interface RpcRequest {
  jsonrpc: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: unknown, code: number, rpcMessage: string, data?: unknown) {
  const error: Record<string, unknown> = { code, message: rpcMessage }
  if (data !== undefined) error.data = data
  return { jsonrpc: '2.0', id, error }
}

/** ApiError → JSON-RPC error: VALIDATION → invalid params, business errors → server error. */
function apiErrorToRpc(error: ApiError): { code: number; data: { code: string; details?: unknown } } {
  const data: { code: string; details?: unknown } = { code: error.code }
  if (error.details !== undefined) data.details = error.details
  return { code: error.code === 'VALIDATION' ? -32602 : -32000, data }
}

async function userFromLingeeCode(platform: Platform, code: string, locale: Locale): Promise<SessionUser> {
  const required = () => authRequired(message(locale, 'authRequired'))
  if (!code.trim()) throw required()
  const result = await platform.auth.verifyLingee(code.trim())
  if (!result.ok) throw required()
  const row = await findBizUserByCredentialId(platform.db, result.user.id)
  if (!row || row.status !== 1) throw required()
  return toSessionUser(row)
}

export function registerMcpRoutes(app: Hono<AppEnv>, platform: Platform): void {
  app.post('/api/mcp', async (c) => {
    const locale = requestLocale(c)
    const user = await userFromLingeeCode(platform, c.req.header('x-lingee-code') ?? '', locale)
    const body = await c.req.json<unknown>().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json(rpcError(null, -32600, 'Invalid Request'))
    }
    const request = body as RpcRequest
    const id = request.id === null || ['string', 'number'].includes(typeof request.id) ? request.id : null
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return c.json(rpcError(id, -32600, 'Invalid Request'))
    }
    switch (request.method) {
      case 'initialize':
        return c.json(
          rpcResult(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          }),
        )
      case 'tools/list':
        return c.json(rpcResult(id, { tools: [CREATE_TICKET_TOOL] }))
      case 'tools/call': {
        const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown }
        if (params.name !== 'create_ticket') {
          return c.json(rpcError(id, -32602, `Unknown tool: ${String(params.name)}`))
        }
        const args = (params.arguments ?? {}) as CreateTicketArgs
        try {
          const result = await mcpCreateTicket(platform.db, platform.attachments, user, args, locale)
          return c.json(rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result) }] }))
        } catch (error) {
          if (error instanceof ApiError) {
            const mapped = apiErrorToRpc(error)
            return c.json(rpcError(id, mapped.code, error.message, mapped.data))
          }
          console.error('[mcp] tool call failed', error)
          return c.json(rpcError(id, -32000, 'Internal error'))
        }
      }
      default:
        return c.json(rpcError(id, -32601, `Method not found: ${request.method}`))
    }
  })
}
