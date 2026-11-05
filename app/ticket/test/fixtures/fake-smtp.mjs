// Local SMTP sink for notification tests. `fail@` recipients are rejected with
// 550 so the "undeliverable" path can be reproduced deterministically.
import { appendFile, mkdir } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const decodeWords = (value) => value.replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_match, encoded) =>
  Buffer.from(encoded, 'base64').toString('utf8'))

function parseHeaders(raw) {
  const headers = {}
  let current = ''
  for (const line of raw.split('\r\n')) {
    if (/^\s/.test(line) && current) {
      headers[current] += ` ${line.trim()}`
      continue
    }
    const index = line.indexOf(':')
    if (index <= 0) continue
    current = line.slice(0, index).trim().toLowerCase()
    headers[current] = line.slice(index + 1).trim()
  }
  return headers
}

const addressOf = (value) => {
  const match = /<([^>]*)>/.exec(value)
  return (match ? match[1] : value).trim().toLowerCase()
}

export async function createMailSink(options = {}) {
  const host = options.host ?? '127.0.0.1'
  const file = path.resolve(options.file ?? process.env.MAIL_SINK_FILE ?? './data/mail-sink.jsonl')
  await mkdir(path.dirname(file), { recursive: true })
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.setEncoding('utf8')
    let buffer = ''
    let dataMode = false
    let dataLines = []
    let from = ''
    const recipients = []
    const reply = (line) => socket.write(`${line}\r\n`)

    socket.write('220 ticket-sink ESMTP\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (dataMode) {
          if (line === '.') {
            dataMode = false
            const raw = dataLines.join('\r\n')
            dataLines = []
            const headers = parseHeaders(raw)
            const bodyStart = raw.indexOf('\r\n\r\n')
            const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw
            void appendFile(file, `${JSON.stringify({
              receivedAt: new Date().toISOString(),
              from,
              to: [...recipients],
              subject: decodeWords(headers.subject ?? ''),
              text: body,
            })}\n`).catch((error) => console.error('[mail-sink] write failed', error.message))
            reply('250 2.0.0 Ok: queued')
          } else {
            dataLines.push(line.startsWith('..') ? line.slice(1) : line)
          }
          continue
        }
        const [command = '', ...rest] = line.split(' ')
        const argument = rest.join(' ')
        switch (command.toUpperCase()) {
          case 'EHLO':
            reply('250-ticket-sink')
            reply('250-8BITMIME')
            reply('250 SIZE 10485760')
            break
          case 'HELO':
            reply('250 ticket-sink')
            break
          case 'MAIL':
            from = addressOf(argument.replace(/^FROM:/i, ''))
            recipients.length = 0
            reply('250 2.1.0 Ok')
            break
          case 'RCPT': {
            const address = addressOf(argument.replace(/^TO:/i, ''))
            if (address.startsWith('fail@')) {
              reply('550 5.1.1 Recipient address rejected')
            } else {
              recipients.push(address)
              reply('250 2.1.5 Ok')
            }
            break
          }
          case 'DATA':
            if (recipients.length === 0) reply('503 5.5.1 Need RCPT first')
            else {
              dataMode = true
              reply('354 End data with <CR><LF>.<CR><LF>')
            }
            break
          case 'RSET':
            from = ''
            recipients.length = 0
            reply('250 2.0.0 Ok')
            break
          case 'NOOP':
            reply('250 2.0.0 Ok')
            break
          case 'QUIT':
            reply('221 2.0.0 Bye')
            socket.end()
            break
          case 'STARTTLS':
          case 'AUTH':
            reply('502 5.5.1 Command not implemented')
            break
          default:
            reply('500 5.5.2 Command not recognized')
        }
      }
    })
    socket.on('error', () => {})
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? Number(process.env.MAIL_SINK_PORT ?? 0), host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mail sink did not obtain a port')

  return {
    host,
    port: address.port,
    file,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const sink = await createMailSink({ port: Number(process.env.MAIL_SINK_PORT ?? 2525) })
  console.log(`[mail-sink] listening on ${sink.host}:${sink.port}, writing ${sink.file}`)
  const shutdown = () => { void sink.close().then(() => process.exit(0)) }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
