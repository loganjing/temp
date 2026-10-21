// 本地可捕获的测试 SMTP 服务：实现 nodemailer 所需的最小明文 SMTP 会话，
// 捕获 DATA 阶段的完整邮件（发件人、收件人、主题、正文），供完成通知邮件验收使用。
import net from 'node:net'
import { StringDecoder } from 'node:string_decoder'

const decodeMimeWords = (text) =>
  // RFC 2047：相邻 encoded-word 之间的空白在解码时删除（folded header 展开后会出现）。
  text.replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]*)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, encoding, data) => {
      if (encoding.toLowerCase() === 'b') return Buffer.from(data, 'base64').toString('utf8')
      const bytes = data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      return Buffer.from(bytes, 'binary').toString('utf8')
    })

const decodeBody = (raw, encoding) => {
  if (encoding === 'base64') return Buffer.from(raw.replace(/\r?\n/g, ''), 'base64').toString('utf8')
  if (encoding === 'quoted-printable') {
    const bytes = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    return Buffer.from(bytes, 'binary').toString('utf8')
  }
  return raw
}

const extractAddress = (value) => {
  const trimmed = value.trim()
  const match = trimmed.match(/<([^>]*)>/)
  return match ? match[1] : trimmed
}

const parseMessage = ({ from, to, data }) => {
  const lines = data.split('\r\n')
  const unfolded = []
  for (const rawLine of lines) {
    const line = line_at(rawLine)
    const previous = unfolded[unfolded.length - 1]
    if (previous !== undefined && (line.startsWith(' ') || line.startsWith('\t'))) {
      unfolded[unfolded.length - 1] = `${previous} ${line.trim()}`
    } else {
      unfolded.push(line)
    }
  }
  const separator = unfolded.indexOf('')
  const headerLines = separator === -1 ? unfolded : unfolded.slice(0, separator)
  const bodyLines = separator === -1 ? [] : unfolded.slice(separator + 1)
  const headers = {}
  for (const header of headerLines) {
    const colon = header.indexOf(':')
    if (colon > 0) headers[header.slice(0, colon).trim().toLowerCase()] = header.slice(colon + 1).trim()
  }
  const encoding = (headers['content-transfer-encoding'] ?? '7bit').toLowerCase()
  return { from, to, subject: decodeMimeWords(headers.subject ?? ''), text: decodeBody(bodyLines.join('\r\n'), encoding) }
}

// SMTP DATA 模式的点填充反转（行首 '..' → '.'）。
const line_at = (rawLine) => (rawLine.startsWith('.') ? rawLine.slice(1) : rawLine)

export function startSmtpCaptureServer() {
  return new Promise((resolve) => {
    const messages = []
    const server = net.createServer((socket) => {
      const decoder = new StringDecoder('utf8')
      let buffer = ''
      let inData = false
      let current = null

      const handleBuffer = () => {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          current.data = buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          inData = false
          messages.push(parseMessage(current))
          current = null
          socket.write('250 2.0.0 OK: queued\r\n')
          handleBuffer()
          return
        }
        while (true) {
          const newline = buffer.indexOf('\r\n')
          if (newline === -1) break
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 2)
          handleLine(line)
          if (inData) {
            handleBuffer()
            return
          }
        }
      }

      const handleLine = (line) => {
        const command = line.toUpperCase()
        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-smtp.capture\r\n250-SIZE 10485760\r\n250 8BITMIME\r\n')
        } else if (command.startsWith('MAIL FROM:')) {
          current = { from: extractAddress(line.slice(10)), to: [], data: '' }
          socket.write('250 2.1.0 OK\r\n')
        } else if (command.startsWith('RCPT TO:')) {
          if (current) current.to.push(extractAddress(line.slice(8)))
          socket.write('250 2.1.5 OK\r\n')
        } else if (command === 'DATA') {
          inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (command === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n')
          socket.end()
        } else {
          socket.write('250 2.0.0 OK\r\n')
        }
      }

      socket.write('220 smtp.capture ESMTP ready\r\n')
      socket.on('data', (chunk) => {
        buffer += decoder.write(chunk)
        handleBuffer()
      })
    })
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        messages,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      })
    })
  })
}
