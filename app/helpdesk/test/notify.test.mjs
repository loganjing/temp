// 通知测试：本地 net 服务器模拟 SMTP 会话（220 问候 / HELO / MAIL / RCPT /
// DATA 点填充 / QUIT），验证契约 §9 的两个触发点与四个收件方向（AC-20）。
import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { createSubmittedTicket, jsonCall, loginAs, pollFor, seedScenario, withIsolatedPlatform } from './api-helpers.mjs'

function startSmtpMock() {
  const mails = []
  const server = net.createServer()
  server.on('connection', (socket) => {
    let buffer = ''
    let dataMode = false
    let current = null
    const reply = (code, text) => socket.write(`${code} ${text}\r\n`)
    // SMTP 服务器在连接建立后必须主动发送 220 问候，客户端在等待它。
    reply(220, 'mock ESMTP ready')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (dataMode) {
          if (line === '.') {
            dataMode = false
            current.lines = current.lines.map((l) => (l.startsWith('..') ? l.slice(1) : l))
            mails.push(current)
            current = null
            reply(250, 'OK')
          } else {
            current.lines.push(line)
          }
          continue
        }
        const command = line.split(' ')[0].toUpperCase()
        if (command === 'HELO' || command === 'EHLO') {
          reply(250, 'mock greets you')
        } else if (command === 'MAIL') {
          current = { mailFrom: line, rcptTo: [], lines: [] }
          reply(250, 'OK')
        } else if (command === 'RCPT') {
          current.rcptTo.push(line)
          reply(250, 'OK')
        } else if (command === 'DATA') {
          dataMode = true
          reply(354, 'End data with <CR><LF>.<CR><LF>')
        } else if (command === 'QUIT') {
          reply(221, 'Bye')
          socket.end()
        } else {
          reply(250, 'OK')
        }
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        mails,
        close: () => new Promise((done) => server.close(done)),
      })
    })
  })
}

const recipientsOf = (mail) => mail.rcptTo.map((line) => line.match(/<([^>]+)>/)[1])

function decodeSubject(mail) {
  const line = mail.lines.find((l) => l.startsWith('Subject: '))
  if (!line) return ''
  const encoded = line.match(/=\?UTF-8\?B\?(.+)\?=/)
  return encoded ? Buffer.from(encoded[1], 'base64').toString('utf8') : line.slice('Subject: '.length)
}

const bodyOf = (mail) => mail.lines.slice(mail.lines.indexOf('') + 1).join('\n')

test('提交工单：受理回执发给提交人，分配通知发给处理人', async () => {
  const mock = await startSmtpMock()
  try {
    await withIsolatedPlatform({ env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(mock.port) } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      const requester = await loginAs(app, 'requester@corp.test')
      const { submit } = await createSubmittedTicket(app, requester)
      assert.equal(submit.status, 200)
      const ticketNo = submit.json.ticket.ticketNo

      const mails = await pollFor(() => (mock.mails.length >= 2 ? mock.mails : null))
      assert.ok(mails, '应收到 2 封邮件')
      assert.equal(mails.length, 2)
      assert.deepEqual(mails.flatMap(recipientsOf).sort(), ['agent-a1@corp.test', 'requester@corp.test'])
      for (const mail of mails) {
        assert.ok(mail.mailFrom.includes('helpdesk-noreply@localhost'), `MAIL FROM 应含默认发件人：${mail.mailFrom}`)
        assert.ok(decodeSubject(mail).includes(ticketNo), `主题应含单号：${decodeSubject(mail)}`)
        assert.ok(bodyOf(mail).includes(ticketNo), `正文应含单号：${bodyOf(mail)}`)
      }
    })
  } finally {
    await mock.close()
  }
})

test('回复通知对侧：提交人回复通知处理人，处理人回复通知提交人', async () => {
  const mock = await startSmtpMock()
  try {
    await withIsolatedPlatform({ env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(mock.port) } }, async ({ platform, app }) => {
      await seedScenario(platform.db)
      const requester = await loginAs(app, 'requester@corp.test')
      const agentA1 = await loginAs(app, 'agent-a1@corp.test')
      const { id } = await createSubmittedTicket(app, requester)
      await pollFor(() => (mock.mails.length >= 2 ? mock.mails : null))

      const requesterReply = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: requester, body: { body: '问题仍未解决' } })
      assert.equal(requesterReply.status, 201)
      const afterRequester = await pollFor(() => (mock.mails.length >= 3 ? mock.mails : null))
      assert.ok(afterRequester, '提交人回复后应通知处理人')
      assert.deepEqual(recipientsOf(afterRequester[2]), ['agent-a1@corp.test'])

      const agentReply = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: agentA1, body: { body: '已定位原因' } })
      assert.equal(agentReply.status, 201)
      const afterAgent = await pollFor(() => (mock.mails.length >= 4 ? mock.mails : null))
      assert.ok(afterAgent, '处理人回复后应通知提交人')
      assert.deepEqual(recipientsOf(afterAgent[3]), ['requester@corp.test'])
    })
  } finally {
    await mock.close()
  }
})
