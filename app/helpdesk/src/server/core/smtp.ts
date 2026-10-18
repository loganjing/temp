// Minimal SMTP client (no third-party dependency). Supports plain and
// STARTTLS connections with optional AUTH LOGIN. Best-effort by design:
// callers treat every failure as a logged no-op (contract §9).
import net from 'node:net'
import tls from 'node:tls'

export interface SmtpOptions {
  host: string
  port: number
  secure?: boolean
  user?: string
  pass?: string
  from: string
}

export interface MailPayload {
  to: string
  subject: string
  text: string
}

export function smtpConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_HOST.trim())
}

export function smtpOptionsFromEnv(env: NodeJS.ProcessEnv): SmtpOptions | null {
  if (!smtpConfigured(env)) return null
  return {
    host: String(env.SMTP_HOST),
    port: Number(env.SMTP_PORT ?? 25),
    secure: String(env.SMTP_SECURE ?? '') === 'true',
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASS || undefined,
    from: String(env.SMTP_FROM ?? 'helpdesk-noreply@localhost'),
  }
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII subjects.
  const ascii = /^[\x20-\x7E]*$/.test(value)
  if (ascii) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

interface SmtpSession {
  socket: net.Socket
  buffer: string
  read(): Promise<{ code: number; lines: string[] }>
  send(command: string): void
  close(): void
}

function openSession(options: SmtpOptions): Promise<SmtpSession> {
  return new Promise((resolve, reject) => {
    const socket: net.Socket = options.secure
      ? tls.connect({ host: options.host, port: options.port, rejectUnauthorized: false })
      : net.connect({ host: options.host, port: options.port })
    socket.setTimeout(15_000)
    const session: SmtpSession = {
      socket,
      buffer: '',
      read() {
        return new Promise((resolveRead, rejectRead) => {
          const onData = (chunk: Buffer) => {
            session.buffer += chunk.toString('utf8')
            if (/\r?\n$/.test(session.buffer)) {
              const text = session.buffer
              session.buffer = ''
              socket.off('data', onData)
              const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
              const code = lines.length > 0 ? Number(lines[lines.length - 1].slice(0, 3)) : 0
              resolveRead({ code, lines })
            }
          }
          socket.on('data', onData)
          socket.once('error', (err) => {
            socket.off('data', onData)
            rejectRead(err)
          })
        })
      },
      send(command: string) {
        socket.write(`${command}\r\n`)
      },
      close() {
        socket.destroy()
      },
    }
    socket.once('error', reject)
    socket.once('timeout', () => {
      session.close()
      reject(new Error('SMTP connection timed out'))
    })
    void session
      .read()
      .then((greeting) => {
        if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.code}`)
        resolve(session)
      })
      .catch(reject)
  })
}

async function expect(session: SmtpSession, command: string, expected: number): Promise<{ code: number; lines: string[] }> {
  session.send(command)
  const reply = await session.read()
  if (reply.code !== expected) throw new Error(`SMTP ${command.split(' ')[0]} failed: ${reply.code}`)
  return reply
}

/** Sends one mail. Throws on any protocol/network error; never retries. */
export async function sendMail(options: SmtpOptions, mail: MailPayload): Promise<void> {
  const session = await openSession(options)
  try {
    await expect(session, `HELO ${options.host}`, 250)
    if (!options.secure && (options.port === 587 || options.port === 465)) {
      const startReply = await expect(session, 'STARTTLS', 220)
      void startReply
      // Upgrade the same socket to TLS.
      const upgraded = (await new Promise<net.Socket>((resolve, reject) => {
        const tlsSocket = tls.connect(
          { socket: session.socket, rejectUnauthorized: false, servername: options.host },
          () => resolve(tlsSocket),
        )
        tlsSocket.once('error', reject)
      })) as net.Socket
      const upgradedSession: SmtpSession = {
        socket: upgraded,
        buffer: '',
        read: session.read.bind({ socket: upgraded, buffer: '', send: session.send, close: session.close } as SmtpSession),
        send: session.send,
        close: session.close,
      }
      // Rebuild read/send on the upgraded socket.
      upgradedSession.send = (command: string) => upgraded.write(`${command}\r\n`)
      upgradedSession.read = () =>
        new Promise((resolveRead, rejectRead) => {
          const onData = (chunk: Buffer) => {
            upgradedSession.buffer += chunk.toString('utf8')
            if (/\r?\n$/.test(upgradedSession.buffer)) {
              const text = upgradedSession.buffer
              upgradedSession.buffer = ''
              upgraded.off('data', onData)
              const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
              const code = lines.length > 0 ? Number(lines[lines.length - 1].slice(0, 3)) : 0
              resolveRead({ code, lines })
            }
          }
          upgraded.on('data', onData)
          upgraded.once('error', (err) => {
            upgraded.off('data', onData)
            rejectRead(err)
          })
        })
      await expect(upgradedSession, `HELO ${options.host}`, 250)
      await finishSend(upgradedSession, options, mail)
      return
    }
    await finishSend(session, options, mail)
  } finally {
    session.close()
  }
}

async function finishSend(session: SmtpSession, options: SmtpOptions, mail: MailPayload): Promise<void> {
  if (options.user && options.pass) {
    await expect(session, 'AUTH LOGIN', 334)
    await expect(session, Buffer.from(options.user, 'utf8').toString('base64'), 334)
    await expect(session, Buffer.from(options.pass, 'utf8').toString('base64'), 235)
  }
  await expect(session, `MAIL FROM:<${options.from}>`, 250)
  await expect(session, `RCPT TO:<${mail.to}>`, 250)
  await expect(session, 'DATA', 354)
  const body = [
    `From: ${encodeHeader('Helpdesk')} <${options.from}>`,
    `To: <${mail.to}>`,
    `Subject: ${encodeHeader(mail.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    mail.text.replace(/^\./gm, '..'),
    '.',
  ].join('\r\n')
  await expect(session, body, 250)
  try {
    await expect(session, 'QUIT', 221)
  } catch {
    // Server may close after DATA; a missing QUIT reply is not a send failure.
  }
}
