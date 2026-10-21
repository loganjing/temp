#!/usr/bin/env node
// wi-t1000316 验证阶段 QA 批量 runner（非浏览器检查）。
//
// 场景（共享同一应用实例与账号体系，按顺序执行；单项失败不阻断互不依赖的后续场景）：
//   S1 security  未认证请求必须被拒绝（401）
//   S2 security  公司隔离：跨公司工单访问 404、列表范围仅本公司
//   S3 security  角色守卫：提交人不得转派/完成（403）
//   S4 E2E/API   QA-07 操作日志全生命周期：创建→分配→归属→回复→转派→完成→评价
//                （+ 第二工单取消），每条日志含操作类型、操作人、操作时间
//   S5 E2E/API   完成通知邮件经真实 SMTP 协议投递（本机桩服务器收件核验）
//
// 用法：
//   MAIN_BASE=http://localhost:4518 SMTP_BASE=http://localhost:4520 \
//     node tests/qa-verify-batch.mjs
import net from 'node:net'

const MAIN_BASE = process.env.MAIN_BASE ?? 'http://localhost:4518'
const SMTP_BASE = process.env.SMTP_BASE ?? 'http://localhost:4520'
const SMTP_STUB_PORT = Number(process.env.SMTP_STUB_PORT ?? 1025)
const DEMO_PASSWORD = 'Demo#12345'
const REQUEST_TIMEOUT_MS = 15000

const results = []

function record(scenarioId, requirementIds, action, expected, actual, status) {
  results.push({ scenarioId, requirementIds, action, expected, actual, status })
  console.log(`[${status.toUpperCase()}] ${scenarioId} :: ${action}`)
  console.log(`    expected: ${expected}`)
  console.log(`    actual:   ${actual}`)
}

async function api(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json }
}

async function login(base, username) {
  const { status, json } = await api(base, '/api/auth/login', {
    method: 'POST',
    body: { username, password: DEMO_PASSWORD },
  })
  if (status !== 200 || !json?.token) {
    throw new Error(`login failed for ${username} on ${base}: HTTP ${status}`)
  }
  return json.token
}

async function fetchGroups(base, token) {
  const { status, json } = await api(base, '/api/groups', { token })
  if (status !== 200 || !json?.items) throw new Error(`list groups failed: HTTP ${status}`)
  return json.items
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

// ---------------------------------------------------------------------------
// SMTP 桩服务器：接受任意发信请求并记录完整报文（含收件人与 DATA 内容）。
// ---------------------------------------------------------------------------
function startSmtpStub(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const messages = []
    const server = net.createServer((socket) => {
      let buffer = ''
      let inData = false
      let current = { from: null, recipients: [], data: '' }
      socket.write('220 qa-stub ESMTP ready\r\n')
      socket.on('data', (chunk) => {
        buffer += chunk.toString('latin1')
        for (;;) {
          if (inData) {
            const end = buffer.indexOf('\r\n.\r\n')
            if (end === -1) return
            current.data += buffer.slice(0, end + 2)
            buffer = buffer.slice(end + 5)
            messages.push({ ...current })
            current = { from: null, recipients: [], data: '' }
            inData = false
            socket.write('250 OK message accepted\r\n')
            continue
          }
          const lineEnd = buffer.indexOf('\r\n')
          if (lineEnd === -1) return
          const line = buffer.slice(0, lineEnd)
          buffer = buffer.slice(lineEnd + 2)
          const upper = line.toUpperCase()
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-qa-stub greets you\r\n250 OK\r\n')
          } else if (upper.startsWith('MAIL FROM')) {
            current.from = line
            socket.write('250 OK\r\n')
          } else if (upper.startsWith('RCPT TO')) {
            current.recipients.push(line)
            socket.write('250 OK\r\n')
          } else if (upper === 'DATA') {
            inData = true
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
          } else if (upper === 'QUIT') {
            socket.write('221 Bye\r\n')
            socket.end()
          } else {
            socket.write('250 OK\r\n')
          }
        }
      })
      socket.on('error', () => {})
    })
    server.on('error', reject)
    server.listen(port, host, () => resolve({ server, messages }))
  })
}

function decodeMimeWords(text) {
  return text
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b64) => {
      try {
        return Buffer.from(b64, 'base64').toString('utf8')
      } catch {
        return _
      }
    })
    .replace(/=\?UTF-8\?Q\?([^?]*)\?=/gi, (_, qp) =>
      qp.replace(/=([0-9A-F]{2})/gi, (__, hex) => String.fromCharCode(Number.parseInt(hex, 16))),
    )
}

function decodeBase64Runs(text) {
  const decoded = []
  for (const match of text.matchAll(/[A-Za-z0-9+/]{40,}={0,2}/g)) {
    try {
      const value = Buffer.from(match[0], 'base64').toString('utf8')
      if (value) decoded.push(value)
    } catch {
      /* ignore non-base64 run */
    }
  }
  return decoded.join('\n')
}

function rawToUtf8(latin1) {
  return Buffer.from(latin1, 'latin1').toString('utf8')
}

// ---------------------------------------------------------------------------
// S1 未认证请求拒绝
// ---------------------------------------------------------------------------
async function scenarioS1() {
  const { status, json } = await api(MAIN_BASE, '/api/tickets')
  const code = json?.error?.code ?? ''
  const pass = status === 401 && code === 'UNAUTHORIZED'
  record(
    'S1',
    ['AC-03'],
    '不带令牌请求 GET /api/tickets',
    'HTTP 401，错误码 UNAUTHORIZED',
    `HTTP ${status}，错误码 ${code || '(无)'}`,
    pass ? 'passed' : 'failed',
  )
}

// ---------------------------------------------------------------------------
// S2 公司隔离（跨公司资源 404、列表仅本公司）
// ---------------------------------------------------------------------------
async function scenarioS2() {
  const bToken = await login(MAIN_BASE, 'b-submitter@demo.io')
  const aToken = await login(MAIN_BASE, 'a-submitter@demo.io')

  const created = await api(MAIN_BASE, '/api/tickets', {
    method: 'POST',
    token: bToken,
    body: {
      subject: 'QA-公司隔离-B公司工单',
      description: '公司 B 提交人创建的隔离验证工单。',
      category: '账务问题',
      priority: 'P2',
    },
  })
  if (created.status !== 201) {
    record('S2', ['AC-03'], '公司 B 提交人创建并分配工单', '创建成功 201', `HTTP ${created.status}`, 'failed')
    return
  }
  const bTicket = created.json.ticket
  const dispatched = await api(MAIN_BASE, `/api/tickets/${bTicket.id}/dispatch`, { method: 'POST', token: bToken })
  record(
    'S2a',
    ['AC-03'],
    `公司 B 创建工单 ${bTicket.ticketNo} 并进入分配（规则：账务问题→账务问题组）`,
    'HTTP 200，状态 processing，归属账务问题组',
    `HTTP ${dispatched.status}，状态 ${dispatched.json?.ticket?.status ?? '?'}，归属 ${dispatched.json?.ticket?.groupName ?? '?'}`,
    dispatched.status === 200 && dispatched.json?.ticket?.status === 'processing' ? 'passed' : 'failed',
  )

  const crossRead = await api(MAIN_BASE, `/api/tickets/${bTicket.id}`, { token: aToken })
  const crossReadOk = crossRead.status === 404 && crossRead.json?.error?.code === 'NOT_FOUND'
  record(
    'S2b',
    ['AC-03'],
    `公司 A 用户读取公司 B 工单 ${bTicket.ticketNo} 详情`,
    'HTTP 404，错误码 NOT_FOUND（不泄露存在性）',
    `HTTP ${crossRead.status}，错误码 ${crossRead.json?.error?.code ?? '(无)'}`,
    crossReadOk ? 'passed' : 'failed',
  )

  const crossWrite = await api(MAIN_BASE, `/api/tickets/${bTicket.id}/cancel`, {
    method: 'POST',
    token: aToken,
    body: { reason: '越权尝试' },
  })
  record(
    'S2c',
    ['AC-03'],
    `公司 A 用户尝试取消公司 B 工单 ${bTicket.ticketNo}`,
    'HTTP 404（写操作同样被隔离边界拒绝）',
    `HTTP ${crossWrite.status}，错误码 ${crossWrite.json?.error?.code ?? '(无)'}`,
    crossWrite.status === 404 ? 'passed' : 'failed',
  )

  const aList = await api(MAIN_BASE, '/api/tickets?view=workbench', { token: aToken })
  const aTotal = aList.json?.total ?? -1
  const aContains = (aList.json?.items ?? []).some((item) => item.id === bTicket.id)
  record(
    'S2d',
    ['AC-03'],
    '公司 A 用户工作台列表（view=workbench）',
    `列表不含公司 B 工单（当前 A 公司工单数为 0）`,
    `total=${aTotal}，是否包含 B 工单：${aContains}`,
    aList.status === 200 && aTotal === 0 && !aContains ? 'passed' : 'failed',
  )

  const bList = await api(MAIN_BASE, '/api/tickets?view=workbench', { token: bToken })
  const bItems = bList.json?.items ?? []
  record(
    'S2e',
    ['AC-03'],
    '公司 B 用户工作台列表（view=workbench）',
    '仅包含本公司工单（含刚创建的隔离验证工单）',
    `total=${bList.json?.total ?? '?'}，包含 ${bTicket.ticketNo}：${bItems.some((item) => item.id === bTicket.id)}`,
    bList.status === 200 && (bList.json?.total ?? 0) >= 1 && bItems.some((item) => item.id === bTicket.id)
      ? 'passed'
      : 'failed',
  )
}

// ---------------------------------------------------------------------------
// S3 角色守卫（提交人不得转派/完成）
// ---------------------------------------------------------------------------
async function scenarioS3() {
  const aToken = await login(MAIN_BASE, 'a-submitter@demo.io')
  const groups = await fetchGroups(MAIN_BASE, aToken)
  const financeGroup = groups.find((group) => group.name === '账务问题组')

  const created = await api(MAIN_BASE, '/api/tickets', {
    method: 'POST',
    token: aToken,
    body: {
      subject: 'QA-角色守卫-待分配工单',
      description: '用于验证提交人角色守卫的工单（功能咨询无规则，保持待分配）。',
      category: '功能咨询',
      priority: 'P3',
    },
  })
  if (created.status !== 201) {
    record('S3', ['AC-03'], '提交人创建守卫验证工单', '创建成功 201', `HTTP ${created.status}`, 'failed')
    return
  }
  const ticket = created.json.ticket
  await api(MAIN_BASE, `/api/tickets/${ticket.id}/dispatch`, { method: 'POST', token: aToken })

  const transfer = await api(MAIN_BASE, `/api/tickets/${ticket.id}/transfer`, {
    method: 'POST',
    token: aToken,
    body: { targetGroupId: financeGroup.id, reason: '越权转派尝试' },
  })
  const transferCode = transfer.json?.error?.code ?? ''
  record(
    'S3a',
    ['AC-03'],
    `提交人（陈晓）对本公司待分配工单 ${ticket.ticketNo} 执行转派`,
    'HTTP 403，错误码 FORBIDDEN（转派限处理人/配置员）',
    `HTTP ${transfer.status}，错误码 ${transferCode || '(无)'}`,
    transfer.status === 403 && transferCode === 'FORBIDDEN' ? 'passed' : 'failed',
  )

  const complete = await api(MAIN_BASE, `/api/tickets/${ticket.id}/complete`, {
    method: 'POST',
    token: aToken,
    body: { resolution: '越权完成尝试' },
  })
  const completeCode = complete.json?.error?.code ?? ''
  record(
    'S3b',
    ['AC-03'],
    `提交人（陈晓）对本公司工单 ${ticket.ticketNo} 执行完成`,
    'HTTP 403，错误码 FORBIDDEN（完成限处理人/配置员）',
    `HTTP ${complete.status}，错误码 ${completeCode || '(无)'}`,
    complete.status === 403 && completeCode === 'FORBIDDEN' ? 'passed' : 'failed',
  )
}

// ---------------------------------------------------------------------------
// S4 操作日志全生命周期（QA-07 / AC-12）
// ---------------------------------------------------------------------------
async function scenarioS4() {
  const submitter = await login(MAIN_BASE, 'a-submitter@demo.io')
  const agent = await login(MAIN_BASE, 'a-agent1@demo.io')
  const groups = await fetchGroups(MAIN_BASE, agent)
  const supportGroup = groups.find((group) => group.name === '技术支持组')
  const financeGroup = groups.find((group) => group.name === '账务问题组')
  const financeMember = financeGroup?.members.find((member) => member.displayName === '周源')

  // 1. 创建 → 状态 created（API 层可观察的初始状态）
  const created = await api(MAIN_BASE, '/api/tickets', {
    method: 'POST',
    token: submitter,
    body: {
      subject: 'QA-日志-完整生命周期工单',
      description: '验证创建、分配、归属、回复、转派、完成、评价全链路操作日志。',
      category: '故障报修',
      priority: 'P1',
    },
  })
  const ticket = created.json?.ticket
  if (created.status !== 201 || !ticket) {
    record('S4', ['AC-12'], '创建全生命周期工单', 'HTTP 201', `HTTP ${created.status}`, 'failed')
    return
  }
  const detailCreated = await api(MAIN_BASE, `/api/tickets/${ticket.id}`, { token: submitter })
  record(
    'S4a',
    ['AC-12', 'AC-04'],
    `创建工单 ${ticket.ticketNo} 后读取详情（分配前）`,
    `HTTP 200，状态 created（初始状态），ticketNo 形如 TK-XXXXXX`,
    `HTTP ${detailCreated.status}，状态 ${detailCreated.json?.ticket?.status ?? '?'}，编号 ${ticket.ticketNo}`,
    detailCreated.json?.ticket?.status === 'created' && /^TK-\d{6}$/.test(ticket.ticketNo) ? 'passed' : 'failed',
  )

  // 2. dispatch → 规则命中（故障报修→技术支持组）→ processing
  const dispatched = await api(MAIN_BASE, `/api/tickets/${ticket.id}/dispatch`, { method: 'POST', token: submitter })
  record(
    'S4b',
    ['AC-12', 'AC-05'],
    `进入分配流程（公司 A 规则：故障报修→技术支持组）`,
    'HTTP 200，状态 processing，归属技术支持组',
    `HTTP ${dispatched.status}，状态 ${dispatched.json?.ticket?.status ?? '?'}，归属 ${dispatched.json?.ticket?.groupName ?? '?'}`,
    dispatched.status === 200 && dispatched.json?.ticket?.status === 'processing' && dispatched.json?.ticket?.groupName === '技术支持组'
      ? 'passed'
      : 'failed',
  )

  // 3. 多轮回复（提交人 + 处理人）
  const reply1 = await api(MAIN_BASE, `/api/tickets/${ticket.id}/replies`, {
    method: 'POST',
    token: submitter,
    body: { content: '提交人补充：每天上午 9-10 点集中出现。' },
  })
  const reply2 = await api(MAIN_BASE, `/api/tickets/${ticket.id}/replies`, {
    method: 'POST',
    token: agent,
    body: { content: '处理人回复：已定位为网关会话过期，正在修复。' },
  })
  record(
    'S4c',
    ['AC-12', 'AC-02'],
    '提交人与处理人先后各回复一次',
    '两次 HTTP 201',
    `提交人回复 HTTP ${reply1.status}，处理人回复 HTTP ${reply2.status}`,
    reply1.status === 201 && reply2.status === 201 ? 'passed' : 'failed',
  )

  // 4. 转派 → 账务问题组/周源，仍为 processing
  const transfer = await api(MAIN_BASE, `/api/tickets/${ticket.id}/transfer`, {
    method: 'POST',
    token: agent,
    body: { targetGroupId: financeGroup.id, targetUserId: financeMember?.userId ?? null, reason: '需要账务口径复核' },
  })
  record(
    'S4d',
    ['AC-12', 'AC-06'],
    `处理人转派工单至账务问题组（成员周源）`,
    'HTTP 200，状态仍为 processing，归属变更为账务问题组',
    `HTTP ${transfer.status}，状态 ${transfer.json?.ticket?.status ?? '?'}，归属 ${transfer.json?.ticket?.groupName ?? '?'}`,
    transfer.status === 200 && transfer.json?.ticket?.status === 'processing' && transfer.json?.ticket?.groupName === '账务问题组'
      ? 'passed'
      : 'failed',
  )

  // 5. 完成 → 记录处理人与时间；触发完成通知（本实例 SMTP 未配置 → skipped）
  const complete = await api(MAIN_BASE, `/api/tickets/${ticket.id}/complete`, {
    method: 'POST',
    token: agent,
    body: { resolution: '已修复网关会话保持配置，复核通过。' },
  })
  const completedTicket = complete.json?.ticket
  const notification = complete.json?.notification
  record(
    'S4e',
    ['AC-12', 'AC-07', 'AC-08'],
    `处理人（林岚）完成工单`,
    'HTTP 200，状态 completed，处理人=林岚，完成时间已记录；通知记录收件人为提交人邮箱',
    `HTTP ${complete.status}，状态 ${completedTicket?.status ?? '?'}，处理人 ${completedTicket?.handlerName ?? '?'}，完成时间 ${completedTicket?.completedAt ?? '未记录'}；通知 ${notification ? `${notification.status}→${notification.recipientEmail}` : '无'}`,
    complete.status === 200 &&
      completedTicket?.status === 'completed' &&
      completedTicket?.handlerName === '林岚' &&
      Boolean(completedTicket?.completedAt) &&
      notification?.recipientEmail === 'a-submitter@demo.io'
      ? 'passed'
      : 'failed',
  )

  // 6. 满意度评价 → 读回
  const rating = await api(MAIN_BASE, `/api/tickets/${ticket.id}/rating`, {
    method: 'POST',
    token: submitter,
    body: { score: 4, comment: 'QA 评价：处理及时。' },
  })
  const detailFinal = await api(MAIN_BASE, `/api/tickets/${ticket.id}`, { token: submitter })
  const readBackRating = detailFinal.json?.rating
  record(
    'S4f',
    ['AC-12', 'AC-09'],
    '提交人提交满意度评价（4 分）并读回',
    'HTTP 201；详情读回 score=4，回复数 2',
    `评价 HTTP ${rating.status}；读回 score=${readBackRating?.score ?? '无'}，回复数 ${detailFinal.json?.replies?.length ?? '?'}`,
    rating.status === 201 && readBackRating?.score === 4 && detailFinal.json?.replies?.length === 2 ? 'passed' : 'failed',
  )

  // 7. 操作日志核验：全动作 + 每条含操作人与时间
  const activity = await api(MAIN_BASE, `/api/tickets/${ticket.id}/activity`, { token: submitter })
  const entries = activity.json?.items ?? []
  const actionCounts = {}
  for (const entry of entries) actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1
  const requiredActions = ['created', 'dispatched', 'assigned', 'replied', 'transferred', 'completed', 'rated']
  const missingActions = requiredActions.filter((action) => !actionCounts[action])
  const badEntries = entries.filter(
    (entry) => !entry.operatorName || !ISO_RE.test(entry.occurredAt ?? ''),
  )
  record(
    'S4g',
    ['AC-12'],
    `查询工单 ${ticket.ticketNo} 操作日志并校验字段完整性`,
    `含 ${requiredActions.join('/')} 动作；每条含非空操作人与 ISO 时间；回复类 ≥2 条`,
    `共 ${entries.length} 条：${Object.entries(actionCounts).map(([k, v]) => `${k}×${v}`).join('、') || '无'}；字段不完整 ${badEntries.length} 条`,
    missingActions.length === 0 && badEntries.length === 0 && (actionCounts.replied ?? 0) >= 2 ? 'passed' : 'failed',
  )

  // 8. 取消路径（第二工单）：功能咨询无规则 → 待分配 → 处理人取消
  const createdCancel = await api(MAIN_BASE, '/api/tickets', {
    method: 'POST',
    token: submitter,
    body: {
      subject: 'QA-日志-取消路径工单',
      description: '验证取消动作的操作日志。',
      category: '功能咨询',
      priority: 'P4',
    },
  })
  const cancelTicket = createdCancel.json?.ticket
  if (createdCancel.status !== 201 || !cancelTicket) {
    record('S4h', ['AC-12', 'AC-04'], '创建取消路径工单', 'HTTP 201', `HTTP ${createdCancel.status}`, 'failed')
    return
  }
  await api(MAIN_BASE, `/api/tickets/${cancelTicket.id}/dispatch`, { method: 'POST', token: submitter })
  const cancel = await api(MAIN_BASE, `/api/tickets/${cancelTicket.id}/cancel`, {
    method: 'POST',
    token: agent,
    body: { reason: 'QA 验证取消路径' },
  })
  const cancelActivity = await api(MAIN_BASE, `/api/tickets/${cancelTicket.id}/activity`, { token: submitter })
  const cancelActions = (cancelActivity.json?.items ?? []).map((entry) => entry.action)
  record(
    'S4h',
    ['AC-12', 'AC-04'],
    `待分配工单 ${cancelTicket.ticketNo} 由处理人取消并核验日志`,
    'HTTP 200，状态 cancelled；日志含 created/dispatched/cancelled',
    `HTTP ${cancel.status}，状态 ${cancel.json?.ticket?.status ?? '?'}；日志动作 ${cancelActions.join('、')}`,
    cancel.status === 200 &&
      cancel.json?.ticket?.status === 'cancelled' &&
      ['created', 'dispatched', 'cancelled'].every((action) => cancelActions.includes(action))
      ? 'passed'
      : 'failed',
  )
}

// ---------------------------------------------------------------------------
// S5 完成通知邮件的真实 SMTP 投递（临时实例 + 桩服务器）
// ---------------------------------------------------------------------------
async function scenarioS5() {
  const stub = await startSmtpStub(SMTP_STUB_PORT)
  try {
    const submitter = await login(SMTP_BASE, 'a-submitter@demo.io')
    const agent = await login(SMTP_BASE, 'a-agent1@demo.io')

    const created = await api(SMTP_BASE, '/api/tickets', {
      method: 'POST',
      token: submitter,
      body: {
        subject: 'QA-邮件-完成通知验证',
        description: '验证完成后向提交人邮箱投递完成通知邮件。',
        category: '故障报修',
        priority: 'P2',
      },
    })
    const ticket = created.json?.ticket
    if (created.status !== 201 || !ticket) {
      record('S5', ['AC-08'], '在临时实例创建工单', 'HTTP 201', `HTTP ${created.status}`, 'failed')
      return
    }
    await api(SMTP_BASE, `/api/tickets/${ticket.id}/dispatch`, { method: 'POST', token: submitter })
    const complete = await api(SMTP_BASE, `/api/tickets/${ticket.id}/complete`, {
      method: 'POST',
      token: agent,
      body: { resolution: '已修复，邮件通知验证。' },
    })
    const notification = complete.json?.notification
    const deliveryStatus = notification?.status ?? '(无)'

    // 等待桩服务器收件（完成接口同步发送，正常应已到达）
    const deadline = Date.now() + 5000
    while (stub.messages.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    const message = stub.messages[0]
    const rawUtf8 = message ? rawToUtf8(message.data) : ''
    const searchable = message ? `${decodeMimeWords(rawUtf8)}\n${decodeBase64Runs(rawUtf8)}` : ''
    const recipientOk = message?.recipients.some((line) => line.includes('a-submitter@demo.io')) ?? false
    const subjectOk = searchable.includes(ticket.ticketNo) && searchable.includes('已完成')
    const bodyOk = searchable.includes('林岚') && searchable.includes(ticket.ticketNo)

    record(
      'S5',
      ['AC-08'],
      `在配置 SMTP 的实例上完成工单 ${ticket.ticketNo}，核验桩邮箱收件`,
      `完成接口通知状态 sent；邮箱收到 1 封收件人为 a-submitter@demo.io 的邮件，主题与正文可识别工单（含处理人林岚）`,
      `完成接口 HTTP ${complete.status}，通知状态 ${deliveryStatus}；桩邮箱收件 ${stub.messages.length} 封；收件人匹配=${recipientOk}，主题可识别工单=${subjectOk}，正文含处理人与工单号=${bodyOk}`,
      complete.status === 200 &&
        deliveryStatus === 'sent' &&
        stub.messages.length >= 1 &&
        recipientOk &&
        subjectOk &&
        bodyOk
        ? 'passed'
        : 'failed',
    )
  } finally {
    await new Promise((resolve) => stub.server.close(resolve))
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`# QA batch runner: MAIN=${MAIN_BASE} SMTP_INSTANCE=${SMTP_BASE} SMTP_STUB=127.0.0.1:${SMTP_STUB_PORT}`)
  const scenarios = [
    ['S1', scenarioS1],
    ['S2', scenarioS2],
    ['S3', scenarioS3],
    ['S4', scenarioS4],
    ['S5', scenarioS5],
  ]
  for (const [id, scenario] of scenarios) {
    try {
      await scenario()
    } catch (error) {
      record(id, [], `执行场景 ${id}`, '场景完成', `前置条件失败：${error instanceof Error ? error.message : String(error)}`, 'blocked')
    }
  }
  const failed = results.filter((item) => item.status !== 'passed')
  console.log('\n# summary')
  console.log(`# total=${results.length} passed=${results.length - failed.length} not-passed=${failed.length}`)
  for (const item of failed) console.log(`# NOT-PASSED ${item.scenarioId}: ${item.action} -> ${item.status}`)
  console.log('# results-json-begin')
  console.log(JSON.stringify(results, null, 2))
  console.log('# results-json-end')
  process.exitCode = failed.length > 0 ? 1 : 0
}

await main()
