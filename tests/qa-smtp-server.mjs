// QA 本地 SMTP 测试服务器：接收工单完成通知邮件并保存到 tests/qa-data/smtp-mailbox.json。
// 仅用于验证阶段（AC-09 邮件通知），不属于产品运行时代码。
import net from 'node:net'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.QA_SMTP_PORT ?? 2525)
const HOST = process.env.QA_SMTP_HOST ?? '127.0.0.1'
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'qa-data')
const MAILBOX = path.join(DATA_DIR, 'smtp-mailbox.json')
const LOG = path.join(DATA_DIR, 'smtp-server.log')
mkdirSync(DATA_DIR, { recursive: true })

const saveMessage = (message) => {
  const all = existsSync(MAILBOX) ? JSON.parse(readFileSync(MAILBOX, 'utf8')) : []
  all.push(message)
  writeFileSync(MAILBOX, JSON.stringify(all, null, 2))
}

const server = net.createServer((socket) => {
  let state = 'command'
  let buffer = ''
  let mailFrom = null
  let rcptTo = []
  let dataLines = []
  const log = (line) => {
    try {
      appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`)
    } catch {
      /* 日志失败不影响 SMTP 会话 */
    }
  }
  socket.setEncoding('utf8')
  socket.write('220 ticket-qa-smtp ESMTP ready\r\n')
  log(`session opened from ${socket.remoteAddress ?? 'unknown'}`)

  const respond = (line) => {
    log(`S: ${line.trim()}`)
    socket.write(`${line}\r\n`)
  }

  socket.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      handleLine(line)
      if (state === 'closed') break
    }
  })

  function handleLine(line) {
    log(`C: ${line}`)
    if (state === 'data') {
      if (line === '.') {
        const raw = dataLines.join('\n')
        saveMessage({
          receivedAt: new Date().toISOString(),
          from: mailFrom,
          to: rcptTo.slice(),
          raw,
        })
        state = 'command'
        mailFrom = null
        rcptTo = []
        dataLines = []
        respond('250 2.0.0 OK: message accepted')
      } else {
        // RFC 5321 点透明化还原
        dataLines.push(line.startsWith('..') ? line.slice(1) : line)
      }
      return
    }
    const upper = line.toUpperCase()
    if (upper.startsWith('EHLO')) {
      respond('250-ticket-qa-smtp greets you')
      respond('250-8BITMIME')
      respond('250 SIZE 10485760')
    } else if (upper.startsWith('HELO')) {
      respond('250 ticket-qa-smtp')
    } else if (upper.startsWith('MAIL FROM:')) {
      mailFrom = line.slice(10).trim()
      rcptTo = []
      respond('250 2.1.0 OK')
    } else if (upper.startsWith('RCPT TO:')) {
      rcptTo.push(line.slice(8).trim())
      respond('250 2.1.5 OK')
    } else if (upper.startsWith('DATA')) {
      if (mailFrom == null || rcptTo.length === 0) {
        respond('503 5.5.1 Error: need MAIL command first')
        return
      }
      state = 'data'
      respond('354 End data with <CR><LF>.<CR><LF>')
    } else if (upper.startsWith('RSET')) {
      mailFrom = null
      rcptTo = []
      dataLines = []
      respond('250 2.0.0 OK')
    } else if (upper.startsWith('NOOP')) {
      respond('250 2.0.0 OK')
    } else if (upper.startsWith('QUIT')) {
      respond('221 2.0.0 Bye')
      state = 'closed'
      socket.end()
    } else if (upper.startsWith('STARTTLS') || upper.startsWith('AUTH')) {
      respond('502 5.5.1 Command not implemented')
    } else {
      respond('500 5.5.2 Error: command not recognized')
    }
  }

  socket.on('error', (error) => log(`socket error: ${error.message}`))
  socket.on('close', () => log('session closed'))
})

server.listen(PORT, HOST, () => {
  console.log(`[qa-smtp] listening on ${HOST}:${PORT}, mailbox=${MAILBOX}`)
})
