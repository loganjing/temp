// Attachment routes (contract §12): multipart upload (201; 413 over 10MB) and
// object-level download visibility (anti-enumeration 404).
import type { Hono } from 'hono'
import { validation } from '../core/errors'
import { message } from '../core/messages'
import type { Locale } from '../../shared/domain'
import { requestLocale, requireSession, type AppEnv } from '../core/session'
import type { Platform } from '../platform/bootstrap'

function targetIdOf(value: string | File | undefined, field: string, locale: Locale): number | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  if (typeof value !== 'string' || !Number.isInteger(parsed) || parsed <= 0) {
    throw validation(message(locale, 'validation'), [field])
  }
  return parsed
}

export function registerAttachmentRoutes(app: Hono<AppEnv>, platform: Platform): void {
  app.post('/api/attachments', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const contentType = c.req.header('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw validation(message(locale, 'validation'), ['file'])
    }
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) {
      throw validation(message(locale, 'validation'), ['file'])
    }
    const saved = await platform.attachments.saveUpload(
      user,
      {
        ticketId: targetIdOf(body.ticketId, 'ticketId', locale),
        replyId: targetIdOf(body.replyId, 'replyId', locale),
      },
      {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()),
      },
      locale,
    )
    return c.json(saved, 201)
  })

  app.get('/api/attachments/:id/download', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const result = await platform.attachments.download(user, c.req.param('id'), locale)
    const asciiName = result.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
    return new Response(new Uint8Array(result.data), {
      headers: {
        'Content-Type': result.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      },
    })
  })
}
