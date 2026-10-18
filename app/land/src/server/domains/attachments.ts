/**
 * 附件域：地契/规划/报价/会议材料/照片上传下载（契约第 3 节附件路由 / AC-01）。
 * 存储复用 @commonapp/attachment 的 LocalStorage 组件；表结构按契约字段（category/note）自建。
 */
import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import Busboy from 'busboy'
import { LocalStorage } from '@commonapp/attachment'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, currentActor, optionalString } from '../lib/api'
import { auditEvent, loadParcel, nowIso, requirePermission, type DomainRoutes, type Row } from '../lib/db'

export const ATTACHMENT_CATEGORIES = ['title-deed', 'planning', 'vendor-quotation', 'meeting', 'photo', 'other'] as const
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024

type UploadResult = { file: { name: string; size: number; mimeType: string; buffer: Buffer }; category: string | null; note: string | null }

async function parseMultipart(request: Request): Promise<UploadResult> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    throw errors.badRequest('multipart/form-data is required')
  }
  let busboy: Busboy.Busboy
  try {
    busboy = Busboy({ headers: { 'content-type': contentType } })
  } catch {
    throw errors.badRequest('invalid multipart request')
  }
  let category: string | null = null
  let note: string | null = null
  let file: UploadResult['file'] | null = null
  let settled = false
  const finish = (error?: Error) => {
    if (settled) return
    settled = true
    if (error) reject(error)
    else if (!file) reject(errors.validationFailed([{ field: 'file', reason: 'file part is required' }]))
    else resolve({ file, category, note })
  }
  let resolve!: (value: UploadResult) => void
  let reject!: (error: Error) => void
  const completed = new Promise<UploadResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  busboy.on('field', (name, value) => {
    if (name === 'category') category = value
    if (name === 'note') note = value
  })
  busboy.on('file', (name, stream, info) => {
    if (name !== 'file' || file) {
      stream.resume()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_ATTACHMENT_SIZE) {
        stream.destroy()
        finish(errors.validationFailed([{ field: 'file', reason: `file exceeds ${MAX_ATTACHMENT_SIZE} bytes` }]))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end', () => {
      file = { name: info.filename || 'upload', size, mimeType: info.mimeType || 'application/octet-stream', buffer: Buffer.concat(chunks) }
    })
    stream.on('error', (error) => finish(errors.badRequest(`upload failed: ${error.message}`)))
  })
  busboy.on('error', (error) => finish(errors.badRequest(`multipart parsing failed: ${error.message}`)))
  busboy.on('finish', () => finish())
  // Node stream 桥接：Web Request.body（ReadableStream）→ busboy（Node Readable），一次性消费。
  const { Readable } = await import('node:stream')
  if (!request.body) throw errors.badRequest('request body is required')
  const nodeStream = Readable.fromWeb(request.body as import('node:stream/web').ReadableStream)
  nodeStream.pipe(busboy)
  nodeStream.on('error', (error) => finish(errors.badRequest(`request stream failed: ${error.message}`)))
  return completed
}

function mapAttachment(row: Row) {
  return {
    id: String(row.id),
    category: String(row.category),
    fileName: String(row.file_name),
    size: Number(row.size),
    note: row.note === null ? null : String(row.note),
    uploadedBy: row.uploaded_by === null ? null : String(row.uploaded_by),
    uploadedAt: String(row.uploaded_at),
  }
}

export const registerAttachmentRoutes: DomainRoutes = (app, platform) => {
  const storage = new LocalStorage({ dir: platform.attachmentsDir })

  app.post('/api/parcels/:id/attachments', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    if (parcel.status === 'completed') throw errors.forbidden('Completed parcels no longer accept attachments')
    const upload = await parseMultipart(context.req.raw)
    if (upload.category && !(ATTACHMENT_CATEGORIES as readonly string[]).includes(upload.category)) {
      throw errors.validationFailed([{ field: 'category', reason: `must be one of ${ATTACHMENT_CATEGORIES.join(' | ')}` }])
    }
    const id = newId('att')
    const storedName = `${parcelId}/${randomUUID()}`
    await storage.save(storedName, upload.file.buffer)
    await platform.db.run({
      text: 'INSERT INTO parcel_attachments (id, parcel_id, category, file_name, size, mime_type, path, note, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, parcelId, upload.category ?? 'other', upload.file.name, upload.file.size, upload.file.mimeType, storedName, optionalString(upload.note, 'note'), actor.id, nowIso()],
    })
    await auditEvent(platform, { type: 'parcel.attachment.uploaded', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: `上传附件 ${upload.file.name}（${upload.category ?? 'other'}）` })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_attachments WHERE id = ?', params: [id] })
    return context.json(mapAttachment(row!), 201)
  })

  app.get('/api/parcels/:id/attachments', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const rows = await platform.db.queryAll<Row>({ text: 'SELECT * FROM parcel_attachments WHERE parcel_id = ? ORDER BY uploaded_at DESC', params: [parcelId] })
    return context.json({ items: rows.map(mapAttachment) })
  })

  app.get('/api/parcels/:id/attachments/:fileId', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_attachments WHERE id = ? AND parcel_id = ?', params: [context.req.param('fileId'), parcelId] })
    if (!row) throw errors.notFound('Attachment not found')
    if (!(await storage.exists(String(row.path)))) throw errors.notFound('Attachment file is missing')
    const data = await storage.read(String(row.path))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': String(row.mime_type),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(String(row.file_name))}`,
      },
    })
  })

  app.delete('/api/parcels/:id/attachments/:fileId', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    if (parcel.status === 'completed') throw errors.forbidden('Completed parcel attachments are retained')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_attachments WHERE id = ? AND parcel_id = ?', params: [context.req.param('fileId'), parcelId] })
    if (!row) throw errors.notFound('Attachment not found')
    await storage.delete(String(row.path))
    await platform.db.run({ text: 'DELETE FROM parcel_attachments WHERE id = ?', params: [String(row.id)] })
    await auditEvent(platform, { type: 'parcel.attachment.deleted', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: `删除附件 ${String(row.file_name)}` })
    return context.json({ ok: true })
  })
}
