// 测试辅助：本地最小 SMTP 服务，捕获 nodemailer 外发邮件（用于验收本地 SMTP 通知）。
import net from 'node:net'

// 解码 MIME encoded-word（Subject 等头部）：=?charset?B/Q?data?=。
function decodeMimeWords(text) {
  return text.replace(/=\?[^?]+\?([BbQq])\?([^?]*)\?=/g, (match, encoding, data) => {
    try {
      if (encoding.toLowerCase() === 'b') return Buffer.from(data, 'base64').toString('utf8')
      const printable = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      return Buffer.from(printable, 'binary').toString('utf8')
    } catch {
      return match
    }
  })
}

function decodeQuotedPrintable(text) {
  const bytes = []
  for (let index = 0; index < text.length; ) {
    const character = text[index]
    if (character === '=') {
      if (text.slice(index + 1, index + 3) === '\r\n') { index += 3; continue }
      if (text[index + 1] === '\n') { index += 2; continue }
      const hex = text.slice(index + 1, index + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(Number.parseInt(hex, 16)); index += 3; continue }
    }
    bytes.push(character.charCodeAt(0) & 0xff)
    index += 1
  }
  return Buffer.from(bytes).toString('utf8')
}

// 把一封 MIME 邮件还原为可断言的可读文本（递归处理 multipart、base64、quoted-printable）。
function decodeMessage(raw, depth = 0) {
  const multipart = /content-type:\s*multipart\/[a-z]+\s*;\s*boundary="?([^";\r\n]+)"?/i.exec(raw)
  if (multipart && depth < 5) {
    return raw
      .split(`--${multipart[1]}`)
      .map((part) => part.replace(/^(--)?\r?\n/, ''))
      .filter((part) => part.trim() !== '')
      .map((part) => decodeMessage(part, depth + 1))
      .join('\r\n')
  }
  const separator = raw.indexOf('\r\n\r\n')
  if (separator === -1) return decodeMimeWords(raw)
  const headers = raw.slice(0, separator)
  let body = raw.slice(separator + 4)
  if (/content-transfer-encoding:\s*base64/i.test(headers)) body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
  else if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) body = decodeQuotedPrintable(body)
  return `${decodeMimeWords(headers)}\r\n${body}`
}

export async function startLocalSmtp() {
  const messages = []
  const server = net.createServer((socket) => {
    const session = { from: null, to: [], data: '', inData: false }
    let buffer = ''
    socket.write('220 local-smtp ready\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      // 命令模式按行处理；DATA 模式等待 <CR><LF>.<CR><LF> 结束符。
      for (;;) {
        if (session.inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          session.data += buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          session.inData = false
          messages.push({ from: session.from, to: [...session.to], data: session.data, decoded: decodeMessage(session.data) })
          session.from = null
          session.to = []
          session.data = ''
          socket.write('250 OK: message accepted\r\n')
          continue
        }
        const newlineIndex = buffer.indexOf('\r\n')
        if (newlineIndex === -1) return
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 2)
        if (/^EHLO/i.test(line)) socket.write('250-local-smtp\r\n250 8BITMIME\r\n')
        else if (/^HELO/i.test(line)) socket.write('250 local-smtp\r\n')
        else if (/^MAIL FROM:/i.test(line)) {
          session.from = line.slice(10).replace(/[<>]/g, '').trim()
          socket.write('250 OK\r\n')
        } else if (/^RCPT TO:/i.test(line)) {
          session.to.push(line.slice(8).replace(/[<>]/g, '').trim())
          socket.write('250 OK\r\n')
        } else if (line === 'DATA') {
          session.inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (/^QUIT/i.test(line)) {
          socket.write('221 Bye\r\n')
          socket.end()
          return
        } else if (/^(RSET|NOOP)/i.test(line)) socket.write('250 OK\r\n')
        else socket.write('500 Command not recognized\r\n')
      }
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    port: server.address().port,
    messages,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
