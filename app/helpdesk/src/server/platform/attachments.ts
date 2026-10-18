// Attachment service on the @commonapp/attachment module (repository + local
// storage). Own routes keep the contract §12 shapes: 413 FILE_TOO_LARGE and
// object-level download visibility (anti-enumeration 404).
// entityId conventions: `ticket-<id>`, `reply-<id>`, `draft-<userId>`.
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { AttachmentRepository, LocalStorage, type AttachmentRecord } from '@commonapp/attachment'
import type { DbClient } from '@commonapp/dbkit'
import type { Locale } from '../../shared/domain'
import { fileTooLarge, forbidden, notFound } from '../core/errors'
import { assertTicketVisible, isHandlingSide } from '../core/guard'
import type { TicketRow } from '../core/rows'
import type { SessionUser } from '../core/session'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export interface UploadTarget {
  ticketId?: number
  replyId?: number
}

export interface SavedUpload {
  id: string
  fileName: string
  sizeBytes: number
}

export interface DownloadResult {
  data: Buffer
  mimeType: string
  fileName: string
}

function ticketMessage(locale: Locale): string {
  return locale === 'zh' ? '工单不存在' : 'Ticket not found'
}

export function createAttachmentService(db: DbClient, env: NodeJS.ProcessEnv) {
  const dir = env.ATTACHMENT_DIR ?? './data/attachments'
  const storage = new LocalStorage({ dir })
  const repo = new AttachmentRepository(db)
  let dirReady = false
  async function ensureDir(): Promise<void> {
    if (!dirReady) {
      await mkdir(path.resolve(dir), { recursive: true })
      dirReady = true
    }
  }

  async function loadTicket(ticketId: number, locale: Locale): Promise<TicketRow> {
    const ticket = await db.queryOne<TicketRow>({
      text: 'SELECT * FROM tickets WHERE id = ?',
      params: [ticketId],
    })
    if (!ticket) throw notFound(ticketMessage(locale))
    return ticket
  }

  async function assertCanAttach(user: SessionUser, ticket: TicketRow, locale: Locale): Promise<void> {
    await assertTicketVisible(db, user, ticket, ticketMessage(locale))
    if (ticket.requester_id !== user.id && !(await isHandlingSide(db, user, ticket))) {
      throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to attach files on this ticket')
    }
  }

  async function entityFor(user: SessionUser, target: UploadTarget, locale: Locale): Promise<string> {
    if (target.ticketId !== undefined) {
      const ticket = await loadTicket(target.ticketId, locale)
      await assertCanAttach(user, ticket, locale)
      return `ticket-${ticket.id}`
    }
    if (target.replyId !== undefined) {
      const reply = await db.queryOne<{ ticket_id: number }>({
        text: 'SELECT ticket_id FROM replies WHERE id = ?',
        params: [target.replyId],
      })
      if (!reply) throw notFound(locale === 'zh' ? '回复不存在' : 'Reply not found')
      const ticket = await loadTicket(reply.ticket_id, locale)
      await assertCanAttach(user, ticket, locale)
      return `reply-${target.replyId}`
    }
    return `draft-${user.id}`
  }

  async function saveUpload(
    user: SessionUser,
    target: UploadTarget,
    file: { name: string; mimeType: string; data: Buffer },
    locale: Locale,
  ): Promise<SavedUpload> {
    if (file.data.length > MAX_ATTACHMENT_BYTES) {
      throw fileTooLarge(locale === 'zh' ? '文件超过 10MB 上限' : 'File exceeds the 10MB limit')
    }
    const entityId = await entityFor(user, target, locale)
    await ensureDir()
    const fileKey = `file_${randomUUID()}`
    await storage.save(fileKey, file.data)
    const record = await repo.add(entityId, {
      name: file.name,
      size: file.data.length,
      mimeType: file.mimeType,
      path: fileKey,
      uploadedById: user.credentialId,
      uploadedByName: locale === 'zh' ? user.nameZh : user.nameEn,
    })
    return { id: record.id, fileName: record.name, sizeBytes: record.size }
  }

  function fileNameFromUrl(url: string): string {
    try {
      const last = new URL(url).pathname.split('/').filter(Boolean).pop()
      return last ? decodeURIComponent(last) : 'attachment'
    } catch {
      return 'attachment'
    }
  }

  /** MCP download hook: fetch attachmentUrl(s) into the same storage (best effort). */
  async function saveMcpDownload(
    user: SessionUser,
    ticketId: number,
    url: string,
  ): Promise<AttachmentRecord> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`attachment download failed: HTTP ${response.status}`)
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > MAX_ATTACHMENT_BYTES) throw new Error('attachment download failed: file exceeds 10MB')
    await ensureDir()
    const fileKey = `file_${randomUUID()}`
    await storage.save(fileKey, data)
    const record = await repo.add(`ticket-${ticketId}`, {
      name: fileNameFromUrl(url),
      size: data.length,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      path: fileKey,
      uploadedById: user.credentialId,
      uploadedByName: 'Lingee Agent',
    })
    await db.run({
      text: 'UPDATE attachments SET source = ? WHERE id = ?',
      params: ['mcp-download', record.id],
    })
    return record
  }

  async function download(user: SessionUser, attachmentId: string, locale: Locale): Promise<DownloadResult> {
    const record = await repo.get(attachmentId)
    const missing = () => notFound(locale === 'zh' ? '附件不存在' : 'Attachment not found')
    if (!record) throw missing()
    if (record.entityId.startsWith('ticket-')) {
      const ticket = await db.queryOne<TicketRow>({
        text: 'SELECT * FROM tickets WHERE id = ?',
        params: [Number(record.entityId.slice('ticket-'.length))],
      })
      if (!ticket) throw missing()
      await assertTicketVisible(db, user, ticket, ticketMessage(locale))
    } else if (record.entityId.startsWith('reply-')) {
      const reply = await db.queryOne<{ ticket_id: number }>({
        text: 'SELECT ticket_id FROM replies WHERE id = ?',
        params: [Number(record.entityId.slice('reply-'.length))],
      })
      const ticket = reply
        ? await db.queryOne<TicketRow>({
            text: 'SELECT * FROM tickets WHERE id = ?',
            params: [reply.ticket_id],
          })
        : null
      if (!ticket) throw missing()
      await assertTicketVisible(db, user, ticket, ticketMessage(locale))
    } else if (record.entityId.startsWith('draft-')) {
      // Draft uploads stay private to their creator (draft privacy, §3.2).
      if (record.entityId !== `draft-${user.id}`) throw missing()
    }
    let data: Buffer
    try {
      data = await storage.read(record.path)
    } catch {
      throw missing()
    }
    return { data, mimeType: record.mimeType, fileName: record.name }
  }

  return { saveUpload, saveMcpDownload, download }
}

export type AttachmentService = ReturnType<typeof createAttachmentService>
