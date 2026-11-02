// 开发期本地样例数据：仅在 DEV 且 VITE_MOCK_API=true 时由 main.tsx 动态加载。
// 所有响应字段严格按 docs/wi-t1000072/technical-contract.md 第 3、4 节构造，不引入契约外接口。
import {
  isRole,
  priorities,
  statuses,
  type AssignmentRule,
  type BusinessGroup,
  type Category,
  type CurrentUser,
  type Role,
  type StatsDashboard,
  type StatsDistribution,
  type SubmitterProfile,
  type TicketDetail,
  type TicketEvent,
  type TicketListItem,
  type TicketNotification,
  type TicketPriority,
  type TicketReply,
  type TicketStatus,
} from '../tickets/types'

type MockTicket = {
  id: string
  companyId: string
  departmentId: string
  title: string
  description: string
  categoryId: string
  priority: TicketPriority
  status: TicketStatus
  submitterId: string
  submitterName: string
  submitterEmail: string
  groupId: string | null
  assigneeId: string | null
  assigneeName: string | null
  createdAt: string
  updatedAt: string
  firstResponseAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  satisfactionScore: number | null
  satisfactionComment: string | null
  satisfactionAt: string | null
}

type MockPerson = { id: string; name: string; email: string; role: Role; companyId: string; departmentId: string }
type MockGroup = { id: string; name: string; companyId: string; createdAt: string; memberIds: string[] }
type MockRule = { id: string; companyId: string; categoryId: string; groupId: string; createdAt: string; updatedAt: string }
type MockEvent = TicketEvent & { ticketId: string }
type MockNotification = TicketNotification & { ticketId: string }

const companies = [
  { id: 'company-a', name: 'ACME 制造' },
  { id: 'company-b', name: '北方物流' },
]
const departments = [
  { id: 'dept-a-ops', name: '运营部', companyId: 'company-a' },
  { id: 'dept-a-it', name: '信息技术部', companyId: 'company-a' },
  { id: 'dept-b-ops', name: '物流运营部', companyId: 'company-b' },
  { id: 'dept-b-it', name: '技术部', companyId: 'company-b' },
]
const categories: Category[] = [
  { id: 'cat-account', code: 'ACCOUNT', name: '账号与登录' },
  { id: 'cat-network', code: 'NETWORK', name: '网络与连接' },
  { id: 'cat-device', code: 'DEVICE', name: '设备与终端' },
  { id: 'cat-other', code: 'OTHER', name: '其他问题' },
]

const people: Record<Role, MockPerson> = {
  submitter: { id: 'user-sub-1', name: '林晓', email: 'lin.xiao@acme.example', role: 'submitter', companyId: 'company-a', departmentId: 'dept-a-ops' },
  handler: { id: 'user-handler-1', name: '周航', email: 'zhou.hang@acme.example', role: 'handler', companyId: 'company-a', departmentId: 'dept-a-it' },
  admin: { id: 'user-admin-1', name: '陈立', email: 'chen.li@acme.example', role: 'admin', companyId: 'company-a', departmentId: 'dept-a-it' },
  ops: { id: 'user-ops-1', name: '赵敏', email: 'zhao.min@platform.example', role: 'ops', companyId: 'company-a', departmentId: 'dept-a-ops' },
}
const extraPeople: MockPerson[] = [
  { id: 'user-handler-2', name: '王蕾', email: 'wang.lei@acme.example', role: 'handler', companyId: 'company-a', departmentId: 'dept-a-it' },
  { id: 'user-handler-3', name: '李强', email: 'li.qiang@acme.example', role: 'handler', companyId: 'company-a', departmentId: 'dept-a-ops' },
  { id: 'user-handler-b', name: '刘洋', email: 'liu.yang@north.example', role: 'handler', companyId: 'company-b', departmentId: 'dept-b-it' },
  { id: 'user-sub-b', name: '何静', email: 'he.jing@north.example', role: 'submitter', companyId: 'company-b', departmentId: 'dept-b-ops' },
]

const groups: MockGroup[] = [
  { id: 'group-a-1', name: '一线支持组', companyId: 'company-a', createdAt: daysAgoIso(120), memberIds: ['user-handler-1', 'user-handler-2'] },
  { id: 'group-a-2', name: '系统运维组', companyId: 'company-a', createdAt: daysAgoIso(90), memberIds: ['user-handler-3'] },
  { id: 'group-b-1', name: '物流支持组', companyId: 'company-b', createdAt: daysAgoIso(90), memberIds: ['user-handler-b'] },
]

const rules: MockRule[] = [
  { id: 'rule-a-1', companyId: 'company-a', categoryId: 'cat-account', groupId: 'group-a-1', createdAt: daysAgoIso(60), updatedAt: daysAgoIso(60) },
  { id: 'rule-a-2', companyId: 'company-a', categoryId: 'cat-network', groupId: 'group-a-2', createdAt: daysAgoIso(60), updatedAt: daysAgoIso(60) },
  { id: 'rule-b-1', companyId: 'company-b', categoryId: 'cat-device', groupId: 'group-b-1', createdAt: daysAgoIso(60), updatedAt: daysAgoIso(60) },
]

const tickets: MockTicket[] = [
  {
    id: 'TK-000001', companyId: 'company-a', departmentId: 'dept-a-ops', title: 'VPN 登录后频繁掉线',
    description: '最近三天连接 VPN 后约十分钟断开一次，重新连接可恢复，影响远程办公。',
    categoryId: 'cat-account', priority: 'P2', status: 'in_progress',
    submitterId: 'user-sub-1', submitterName: '林晓', submitterEmail: 'lin.xiao@acme.example',
    groupId: 'group-a-1', assigneeId: 'user-handler-1', assigneeName: '周航',
    createdAt: daysAgoIso(3, 9), updatedAt: daysAgoIso(2, 10), firstResponseAt: daysAgoIso(3, 11),
    completedAt: null, cancelledAt: null, satisfactionScore: null, satisfactionComment: null, satisfactionAt: null,
  },
  {
    id: 'TK-000002', companyId: 'company-a', departmentId: 'dept-a-ops', title: '会议室投影无法识别笔记本',
    description: '三楼大会议室的投影仪无法识别新配发的笔记本，会议开始前需要协助排查。',
    categoryId: 'cat-device', priority: 'P1', status: 'unassigned',
    submitterId: 'user-sub-1', submitterName: '林晓', submitterEmail: 'lin.xiao@acme.example',
    groupId: null, assigneeId: null, assigneeName: null,
    createdAt: daysAgoIso(1, 8), updatedAt: daysAgoIso(1, 8), firstResponseAt: null,
    completedAt: null, cancelledAt: null, satisfactionScore: null, satisfactionComment: null, satisfactionAt: null,
  },
  {
    id: 'TK-000003', companyId: 'company-a', departmentId: 'dept-a-ops', title: '生产网段访问速度缓慢',
    description: '访问生产网段内的报表系统加载时间超过一分钟，其他系统正常。',
    categoryId: 'cat-network', priority: 'P3', status: 'completed',
    submitterId: 'user-sub-1', submitterName: '林晓', submitterEmail: 'lin.xiao@acme.example',
    groupId: 'group-a-2', assigneeId: 'user-handler-3', assigneeName: '李强',
    createdAt: daysAgoIso(6, 10), updatedAt: daysAgoIso(4, 15), firstResponseAt: daysAgoIso(6, 14),
    completedAt: daysAgoIso(4, 15), cancelledAt: null, satisfactionScore: 5, satisfactionComment: '处理及时，说明清楚。', satisfactionAt: daysAgoIso(4, 16),
  },
  {
    id: 'TK-000004', companyId: 'company-a', departmentId: 'dept-a-ops', title: '邮箱附件超过 20MB 无法发送',
    description: '发送带大附件的邮件时提示大小超限，请确认是否有可用的临时传输方式。',
    categoryId: 'cat-account', priority: 'P4', status: 'completed',
    submitterId: 'user-sub-1', submitterName: '林晓', submitterEmail: 'lin.xiao@acme.example',
    groupId: 'group-a-1', assigneeId: 'user-handler-1', assigneeName: '周航',
    createdAt: daysAgoIso(9, 9), updatedAt: daysAgoIso(8, 11), firstResponseAt: daysAgoIso(8, 11),
    completedAt: daysAgoIso(8, 11), cancelledAt: null, satisfactionScore: null, satisfactionComment: null, satisfactionAt: null,
  },
  {
    id: 'TK-000005', companyId: 'company-b', departmentId: 'dept-b-ops', title: '仓库扫码枪连接中断',
    description: '二号仓库的扫码枪在作业高峰期频繁断开，影响入库登记。',
    categoryId: 'cat-device', priority: 'P0', status: 'in_progress',
    submitterId: 'user-sub-b', submitterName: '何静', submitterEmail: 'he.jing@north.example',
    groupId: 'group-b-1', assigneeId: 'user-handler-b', assigneeName: '刘洋',
    createdAt: daysAgoIso(2, 7), updatedAt: daysAgoIso(2, 8), firstResponseAt: daysAgoIso(2, 8),
    completedAt: null, cancelledAt: null, satisfactionScore: null, satisfactionComment: null, satisfactionAt: null,
  },
  {
    id: 'TK-000006', companyId: 'company-a', departmentId: 'dept-a-ops', title: '申请开通访客网络账号',
    description: '下周有外部审计团队到访，需要提前开通临时访客网络账号。',
    categoryId: 'cat-other', priority: 'P3', status: 'cancelled',
    submitterId: 'user-sub-1', submitterName: '林晓', submitterEmail: 'lin.xiao@acme.example',
    groupId: null, assigneeId: null, assigneeName: null,
    createdAt: daysAgoIso(12, 10), updatedAt: daysAgoIso(11, 9), firstResponseAt: null,
    completedAt: null, cancelledAt: daysAgoIso(11, 9), satisfactionScore: null, satisfactionComment: null, satisfactionAt: null,
  },
  {
    id: 'TK-000007', companyId: 'company-b', departmentId: 'dept-b-ops', title: '运输系统导出报表编码乱码',
    description: '导出 CSV 报表时中文字段出现乱码，需要确认导出编码设置。',
    categoryId: 'cat-other', priority: 'P2', status: 'unassigned',
    submitterId: 'user-sub-b', submitterName: '何静', submitterEmail: 'he.jing@north.example',
    groupId: null, assigneeId: null, assigneeName: null,
    createdAt: daysAgoIso(1, 14), updatedAt: daysAgoIso(1, 14), firstResponseAt: null,
    completedAt: null, cancelledAt: null, satisfactionScore: null, satisfactionComment: null, satisfactionAt: null,
  },
]

const replies: TicketReply[] = [
  { id: 'reply-1', ticketId: 'TK-000001', authorId: 'user-handler-1', authorName: '周航', authorRole: 'handler', body: '已收到，麻烦提供掉线时的错误提示截图，我先检查 VPN 网关日志。', createdAt: daysAgoIso(3, 11) },
  { id: 'reply-2', ticketId: 'TK-000001', authorId: 'user-sub-1', authorName: '林晓', authorRole: 'submitter', body: '截图已上传到共享目录，提示为“隧道重建中”。', createdAt: daysAgoIso(2, 10) },
  { id: 'reply-3', ticketId: 'TK-000003', authorId: 'user-handler-3', authorName: '李强', authorRole: 'handler', body: '已定位到生产网段链路抖动，已切换备用线路，请再观察一天。', createdAt: daysAgoIso(6, 14) },
  { id: 'reply-4', ticketId: 'TK-000005', authorId: 'user-handler-b', authorName: '刘洋', authorRole: 'handler', body: '已到现场检查，初步判断为无线接入点负载过高，正在调整。', createdAt: daysAgoIso(2, 8) },
  { id: 'reply-5', ticketId: 'TK-000004', authorId: 'user-handler-1', authorName: '周航', authorRole: 'handler', body: '已开通临时文件传输空间，链接与使用说明见邮件。', createdAt: daysAgoIso(8, 11) },
]

const events: MockEvent[] = [
  { id: 'event-1', ticketId: 'TK-000001', action: 'created', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { toStatus: 'unassigned' }, createdAt: daysAgoIso(3, 9) },
  { id: 'event-2', ticketId: 'TK-000001', action: 'auto_assigned', actorId: 'system', actorName: '系统', result: 'success', detail: { toStatus: 'in_progress', groupName: '一线支持组' }, createdAt: daysAgoIso(3, 9) },
  { id: 'event-3', ticketId: 'TK-000001', action: 'replied', actorId: 'user-handler-1', actorName: '周航', result: 'success', detail: null, createdAt: daysAgoIso(3, 11) },
  { id: 'event-4', ticketId: 'TK-000002', action: 'created', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { toStatus: 'unassigned' }, createdAt: daysAgoIso(1, 8) },
  { id: 'event-5', ticketId: 'TK-000003', action: 'created', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { toStatus: 'unassigned' }, createdAt: daysAgoIso(6, 10) },
  { id: 'event-6', ticketId: 'TK-000003', action: 'auto_assigned', actorId: 'system', actorName: '系统', result: 'success', detail: { toStatus: 'in_progress', groupName: '系统运维组' }, createdAt: daysAgoIso(6, 10) },
  { id: 'event-7', ticketId: 'TK-000003', action: 'replied', actorId: 'user-handler-3', actorName: '李强', result: 'success', detail: null, createdAt: daysAgoIso(6, 14) },
  { id: 'event-8', ticketId: 'TK-000003', action: 'completed', actorId: 'user-handler-3', actorName: '李强', result: 'success', detail: { fromStatus: 'in_progress', toStatus: 'completed' }, createdAt: daysAgoIso(4, 15) },
  { id: 'event-9', ticketId: 'TK-000003', action: 'email_skipped', actorId: 'system', actorName: '系统', result: 'success', detail: { status: 'skipped', recipientEmail: 'lin.xiao@acme.example' }, createdAt: daysAgoIso(4, 15) },
  { id: 'event-10', ticketId: 'TK-000003', action: 'rated', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { score: 5 }, createdAt: daysAgoIso(4, 16) },
  { id: 'event-11', ticketId: 'TK-000004', action: 'created', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { toStatus: 'in_progress' }, createdAt: daysAgoIso(9, 9) },
  { id: 'event-12', ticketId: 'TK-000004', action: 'replied', actorId: 'user-handler-1', actorName: '周航', result: 'success', detail: null, createdAt: daysAgoIso(8, 11) },
  { id: 'event-13', ticketId: 'TK-000004', action: 'completed', actorId: 'user-handler-1', actorName: '周航', result: 'success', detail: { fromStatus: 'in_progress', toStatus: 'completed' }, createdAt: daysAgoIso(8, 11) },
  { id: 'event-14', ticketId: 'TK-000004', action: 'email_sent', actorId: 'system', actorName: '系统', result: 'success', detail: { status: 'sent', recipientEmail: 'lin.xiao@acme.example' }, createdAt: daysAgoIso(8, 11) },
  { id: 'event-15', ticketId: 'TK-000005', action: 'created', actorId: 'user-sub-b', actorName: '何静', result: 'success', detail: { toStatus: 'in_progress' }, createdAt: daysAgoIso(2, 7) },
  { id: 'event-16', ticketId: 'TK-000005', action: 'replied', actorId: 'user-handler-b', actorName: '刘洋', result: 'success', detail: null, createdAt: daysAgoIso(2, 8) },
  { id: 'event-17', ticketId: 'TK-000006', action: 'created', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { toStatus: 'unassigned' }, createdAt: daysAgoIso(12, 10) },
  { id: 'event-18', ticketId: 'TK-000006', action: 'cancelled', actorId: 'user-sub-1', actorName: '林晓', result: 'success', detail: { fromStatus: 'unassigned', toStatus: 'cancelled' }, createdAt: daysAgoIso(11, 9) },
  { id: 'event-19', ticketId: 'TK-000007', action: 'created', actorId: 'user-sub-b', actorName: '何静', result: 'success', detail: { toStatus: 'unassigned' }, createdAt: daysAgoIso(1, 14) },
]

const notifications: MockNotification[] = [
  { id: 'notice-1', ticketId: 'TK-000003', kind: 'completion', recipientEmail: 'lin.xiao@acme.example', subject: '工单 TK-000003 已完成', status: 'skipped', attempt: 1, errorMessage: '未配置 SMTP', createdAt: daysAgoIso(4, 15), sentAt: null },
  { id: 'notice-2', ticketId: 'TK-000004', kind: 'completion', recipientEmail: 'lin.xiao@acme.example', subject: '工单 TK-000004 已完成', status: 'sent', attempt: 1, errorMessage: null, createdAt: daysAgoIso(8, 11), sentAt: daysAgoIso(8, 11) },
]

let installed = false

export function installMockApi() {
  if (installed) return
  installed = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw, window.location.origin)
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init)
    return handleRequest(url, (init?.method ?? 'GET').toUpperCase(), init)
  }
}

async function handleRequest(url: URL, method: string, init?: RequestInit): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '')
  const body = await readBody(init)
  const user = currentUser()

  if (path === '/auth/bootstrap-status') return ok({ required: false })
  if (path === '/auth/login') return ok({ token: 'mock-token', user: { id: user.id, role: user.role, status: 'active', name: user.name, email: user.email, companyId: user.companyId, departmentId: user.departmentId, roles: [user.role], passwordChangeRequired: false } })
  if (path === '/auth/me') return ok(user)
  if (path === '/auth/password') return ok({ ok: true, passwordChangeRequired: false })

  if (path === '/categories' && method === 'GET') return ok(categories)

  if (path === '/meta/companies' && method === 'GET') {
    return ok(user.role === 'ops' ? companies : companies.filter((company) => company.id === user.companyId))
  }
  if (path === '/meta/departments' && method === 'GET') {
    const companyId = user.role === 'ops' ? url.searchParams.get('companyId') : user.companyId
    return ok(companyId ? departments.filter((department) => department.companyId === companyId) : departments)
  }

  if (path === '/tickets' && method === 'GET') return ok(listTickets(url))
  if (path === '/tickets' && method === 'POST') return createTicket(user, body)

  const ticketMatch = path.match(/^\/tickets\/([^/]+)(?:\/(.+))?$/)
  if (ticketMatch) {
    const ticketId = decodeURIComponent(ticketMatch[1])
    const rest = ticketMatch[2] ?? ''
    const ticket = tickets.find((item) => item.id === ticketId.toUpperCase())
    if (!ticket) return fail(404, 'not_found', '工单不存在')
    if (!canView(user, ticket)) return fail(403, 'forbidden', '无权访问该工单')

    if (rest === '' && method === 'GET') return ok(toDetail(user, ticket))
    if (rest === 'submitter' && method === 'GET') {
      if (user.role === 'submitter') return fail(403, 'forbidden', '无权查看提交人信息')
      return ok(submitterProfile(ticket))
    }
    if (rest === 'replies' && method === 'GET') return ok(replies.filter((reply) => reply.ticketId === ticket.id))
    if (rest === 'replies' && method === 'POST') return addReply(user, ticket, body)
    if (rest === 'events' && method === 'GET') return ok(stripTicketId(events.filter((event) => event.ticketId === ticket.id)))
    if (rest === 'notifications' && method === 'GET') {
      if (user.role === 'submitter') return fail(403, 'forbidden', '无权查看通知记录')
      return ok(stripTicketId([...notifications].filter((notification) => notification.ticketId === ticket.id).reverse()))
    }
    if (rest === 'assign' && method === 'POST') return assignTicket(user, ticket, body)
    if (rest === 'transfer' && method === 'POST') return transferTicket(user, ticket, body)
    if (rest === 'complete' && method === 'POST') return completeTicket(user, ticket)
    if (rest === 'cancel' && method === 'POST') return cancelTicket(user, ticket)
    if (rest === 'priority' && method === 'PATCH') return changePriority(user, ticket, body)
    if (rest === 'rating' && method === 'POST') return rateTicket(user, ticket, body)

    const resendMatch = rest.match(/^notifications\/([^/]+)\/resend$/)
    if (resendMatch && method === 'POST') return resendNotification(user, ticket, decodeURIComponent(resendMatch[1]))
  }

  if (path === '/groups' && method === 'GET') {
    if (user.role === 'submitter') return fail(403, 'forbidden', '无权查看业务组')
    return ok(visibleGroups(user).map(toGroup))
  }
  if (path === '/groups' && method === 'POST') return createGroup(user, body)

  const groupMatch = path.match(/^\/groups\/([^/]+)(?:\/members(?:\/([^/]+))?)?$/)
  if (groupMatch) {
    const group = groups.find((item) => item.id === decodeURIComponent(groupMatch[1]))
    if (!group) return fail(404, 'not_found', '业务组不存在')
    if (user.role !== 'admin' || group.companyId !== user.companyId) return fail(403, 'forbidden', '无权配置该业务组')
    const memberId = groupMatch[2] ? decodeURIComponent(groupMatch[2]) : null
    if (!memberId && method === 'PATCH') return renameGroup(group, body)
    if (!memberId && method === 'DELETE') return deleteGroup(group)
    if (memberId === null && path.endsWith('/members') && method === 'POST') return addMember(group, body)
    if (memberId && method === 'DELETE') return removeMember(group, memberId)
  }

  if (path === '/assignment-rules' && method === 'GET') {
    if (user.role !== 'admin') return fail(403, 'forbidden', '无权查看分配规则')
    return ok(rules.filter((rule) => rule.companyId === user.companyId).map((rule) => toRule(rule)))
  }
  if (path === '/assignment-rules' && method === 'POST') return createRule(user, body)

  const ruleMatch = path.match(/^\/assignment-rules\/([^/]+)$/)
  if (ruleMatch) {
    const rule = rules.find((item) => item.id === decodeURIComponent(ruleMatch[1]))
    if (!rule) return fail(404, 'not_found', '分配规则不存在')
    if (user.role !== 'admin' || rule.companyId !== user.companyId) return fail(403, 'forbidden', '无权配置分配规则')
    if (method === 'PUT') return updateRule(rule, body)
    if (method === 'DELETE') { removeRule(rule); return ok({ ok: true }) }
  }

  if (path === '/stats/distribution' && method === 'GET') return ok(distribution(user, url))
  if (path === '/stats/dashboard' && method === 'GET') return ok(dashboard(user, url))

  return fail(404, 'not_found', 'API route not found')
}

function ok(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
function fail(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } })
}

async function readBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try { return JSON.parse(init.body) as Record<string, unknown> } catch { return {} }
}

function currentUser(): CurrentUser {
  const param = new URL(window.location.href).searchParams.get('mockRole')
  if (param && isRole(param)) sessionStorage.setItem('ticket-mock-role', param)
  const stored = sessionStorage.getItem('ticket-mock-role')
  const role: Role = isRole(stored) ? stored : 'admin'
  const person = people[role]
  return {
    ...person,
    companyName: companyName(person.companyId),
    departmentName: departmentName(person.departmentId),
    roles: [role],
  }
}

function companyName(id: string) { return companies.find((company) => company.id === id)?.name ?? id }
function departmentName(id: string) { return departments.find((department) => department.id === id)?.name ?? id }
function categoryName(id: string) { return categories.find((category) => category.id === id)?.name ?? id }
function groupName(id: string | null) { return id ? groups.find((group) => group.id === id)?.name ?? id : null }

function personById(id: string) { return Object.values(people).find((person) => person.id === id) ?? extraPeople.find((person) => person.id === id) ?? null }
function isGroupMember(groupId: string | null, userId: string) { return Boolean(groupId && groups.find((group) => group.id === groupId)?.memberIds.includes(userId)) }

function canView(user: CurrentUser, ticket: MockTicket) {
  if (user.role === 'ops') return true
  if (user.role === 'submitter') return ticket.submitterId === user.id
  return ticket.companyId === user.companyId
}

function visibleTickets(user: CurrentUser) { return tickets.filter((ticket) => canView(user, ticket)) }

function visibleGroups(user: CurrentUser) { return user.role === 'ops' ? groups : groups.filter((group) => group.companyId === user.companyId) }

function toListItem(ticket: MockTicket): TicketListItem {
  return {
    id: ticket.id,
    title: ticket.title,
    categoryId: ticket.categoryId,
    categoryName: categoryName(ticket.categoryId),
    priority: ticket.priority,
    status: ticket.status,
    companyId: ticket.companyId,
    companyName: companyName(ticket.companyId),
    departmentId: ticket.departmentId,
    departmentName: departmentName(ticket.departmentId),
    submitterId: ticket.submitterId,
    submitterName: ticket.submitterName,
    groupId: ticket.groupId,
    groupName: groupName(ticket.groupId),
    assigneeId: ticket.assigneeId,
    assigneeName: ticket.assigneeName,
    createdAt: ticket.createdAt,
    satisfactionScore: ticket.satisfactionScore,
  }
}

function toDetail(user: CurrentUser, ticket: MockTicket): TicketDetail {
  const terminal = ticket.status === 'completed' || ticket.status === 'cancelled'
  const sameCompany = ticket.companyId === user.companyId
  return {
    ...toListItem(ticket),
    description: ticket.description,
    submitterEmail: ticket.submitterEmail,
    updatedAt: ticket.updatedAt,
    firstResponseAt: ticket.firstResponseAt,
    completedAt: ticket.completedAt,
    cancelledAt: ticket.cancelledAt,
    satisfactionComment: ticket.satisfactionComment,
    satisfactionAt: ticket.satisfactionAt,
    canReply: !terminal && (user.role === 'handler' || user.role === 'admin' || (user.role === 'submitter' && ticket.submitterId === user.id)),
    canAssign: (user.role === 'handler' || user.role === 'admin') && ticket.status === 'unassigned' && sameCompany,
    canTransfer: (user.role === 'handler' || user.role === 'admin') && ticket.status === 'in_progress' && sameCompany && (user.role === 'admin' || isGroupMember(ticket.groupId, user.id)),
    canComplete: (user.role === 'handler' || user.role === 'admin') && ticket.status === 'in_progress' && sameCompany,
    canCancel: !terminal && sameCompany && (user.role === 'handler' || user.role === 'admin' || (user.role === 'submitter' && ticket.submitterId === user.id)),
    canRate: user.role === 'submitter' && ticket.submitterId === user.id && ticket.status === 'completed' && ticket.satisfactionScore === null,
    canChangePriority: (user.role === 'handler' || user.role === 'admin') && ticket.status === 'in_progress' && sameCompany,
  }
}

function submitterProfile(ticket: MockTicket): SubmitterProfile {
  const history = tickets
    .filter((item) => item.submitterId === ticket.submitterId && item.companyId === ticket.companyId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50)
    .map((item) => ({ id: item.id, title: item.title, status: item.status, priority: item.priority, createdAt: item.createdAt, categoryName: categoryName(item.categoryId) }))
  return {
    name: ticket.submitterName,
    email: ticket.submitterEmail,
    companyName: companyName(ticket.companyId),
    departmentName: departmentName(ticket.departmentId),
    history,
  }
}

function listTickets(url: URL) {
  const user = currentUser()
  const params = url.searchParams
  let result = visibleTickets(user)
  if (user.role === 'ops' && params.get('companyId')) result = result.filter((ticket) => ticket.companyId === params.get('companyId'))
  if (params.get('departmentId')) result = result.filter((ticket) => ticket.departmentId === params.get('departmentId'))
  if (params.get('status')) result = result.filter((ticket) => ticket.status === params.get('status'))
  if (params.get('priority')) result = result.filter((ticket) => ticket.priority === params.get('priority'))
  if (params.get('categoryId')) result = result.filter((ticket) => ticket.categoryId === params.get('categoryId'))
  if (params.get('groupId')) result = result.filter((ticket) => ticket.groupId === params.get('groupId'))
  const q = params.get('q')?.trim().toLowerCase()
  if (q) result = result.filter((ticket) => ticket.title.toLowerCase().includes(q) || ticket.id.toLowerCase().includes(q))
  const sort = params.get('sort') ?? 'createdAt_desc'
  const priorityRank = (value: TicketPriority) => priorities.length - priorities.indexOf(value)
  result = [...result].sort((left, right) => {
    if (sort === 'createdAt_asc') return left.createdAt.localeCompare(right.createdAt)
    if (sort === 'priority_asc') return priorityRank(left.priority) - priorityRank(right.priority)
    if (sort === 'priority_desc') return priorityRank(right.priority) - priorityRank(left.priority)
    return right.createdAt.localeCompare(left.createdAt)
  })
  const page = Math.max(Number(params.get('page') ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(params.get('pageSize') ?? 20), 1), 100)
  return { items: result.slice((page - 1) * pageSize, page * pageSize).map(toListItem), total: result.length }
}

function createTicket(user: CurrentUser, body: Record<string, unknown>) {
  if (user.role !== 'submitter') return fail(403, 'forbidden', '仅提交人可创建工单')
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
  const priority = typeof body.priority === 'string' ? body.priority : ''
  if (!title || title.length > 200) return fail(400, 'validation_error', '主题长度需为 1–200 字符')
  if (!description || description.length > 5000) return fail(400, 'validation_error', '描述长度需为 1–5000 字符')
  if (!categories.some((category) => category.id === categoryId)) return fail(400, 'validation_error', '问题分类无效')
  if (!(priorities as string[]).includes(priority)) return fail(400, 'validation_error', '优先级需为 P0–P4')

  const now = new Date().toISOString()
  const rule = rules.find((item) => item.companyId === user.companyId && item.categoryId === categoryId)
  const next = `TK-${String(tickets.length + 1).padStart(6, '0')}`
  const ticket: MockTicket = {
    id: next,
    companyId: user.companyId,
    departmentId: user.departmentId,
    title,
    description,
    categoryId,
    priority: priority as TicketPriority,
    status: rule ? 'in_progress' : 'unassigned',
    submitterId: user.id,
    submitterName: user.name,
    submitterEmail: user.email,
    groupId: rule?.groupId ?? null,
    assigneeId: null,
    assigneeName: null,
    createdAt: now,
    updatedAt: now,
    firstResponseAt: null,
    completedAt: null,
    cancelledAt: null,
    satisfactionScore: null,
    satisfactionComment: null,
    satisfactionAt: null,
  }
  tickets.push(ticket)
  pushEvent(ticket.id, 'created', user.id, user.name, { toStatus: 'unassigned' })
  if (rule) pushEvent(ticket.id, 'auto_assigned', 'system', '系统', { toStatus: 'in_progress', groupName: groupName(rule.groupId) })
  return ok(toDetail(user, ticket))
}

function addReply(user: CurrentUser, ticket: MockTicket, body: Record<string, unknown>) {
  if (ticket.status === 'completed' || ticket.status === 'cancelled') return fail(409, 'ticket_closed', '工单已结束')
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text || text.length > 5000) return fail(400, 'validation_error', '回复内容长度需为 1–5000 字符')
  const now = new Date().toISOString()
  const reply: TicketReply = { id: id('reply'), ticketId: ticket.id, authorId: user.id, authorName: user.name, authorRole: user.role, body: text, createdAt: now }
  replies.push(reply)
  if (!ticket.firstResponseAt && user.role !== 'submitter') ticket.firstResponseAt = now
  ticket.updatedAt = now
  pushEvent(ticket.id, 'replied', user.id, user.name, null)
  return ok(reply)
}

function assignTicket(user: CurrentUser, ticket: MockTicket, body: Record<string, unknown>) {
  if (user.role !== 'handler' && user.role !== 'admin') return fail(403, 'forbidden', '无权分配该工单')
  if (ticket.companyId !== user.companyId) return fail(403, 'forbidden', '无权分配该工单')
  if (ticket.status !== 'unassigned') return fail(409, 'invalid_transition', '仅待分配工单可分配')
  const group = groups.find((item) => item.id === body.groupId)
  if (!group || group.companyId !== ticket.companyId) return fail(400, 'validation_error', '业务组无效')
  const now = new Date().toISOString()
  ticket.groupId = group.id
  ticket.status = 'in_progress'
  ticket.updatedAt = now
  pushEvent(ticket.id, 'assigned', user.id, user.name, { fromStatus: 'unassigned', toStatus: 'in_progress', groupName: group.name })
  return ok(toDetail(user, ticket))
}

function transferTicket(user: CurrentUser, ticket: MockTicket, body: Record<string, unknown>) {
  if (user.role !== 'handler' && user.role !== 'admin') return fail(403, 'forbidden', '无权转派该工单')
  if (ticket.companyId !== user.companyId) return fail(403, 'forbidden', '无权转派该工单')
  if (ticket.status !== 'in_progress') return fail(409, 'invalid_transition', '仅待处理工单可转派')
  if (user.role !== 'admin' && !isGroupMember(ticket.groupId, user.id)) return fail(403, 'forbidden', '仅当前承接组成员可转派')
  const target = groups.find((item) => item.id === body.toGroupId)
  if (!target || target.companyId !== ticket.companyId || target.id === ticket.groupId) return fail(400, 'validation_error', '目标业务组无效')
  const fromGroupName = groupName(ticket.groupId)
  ticket.groupId = target.id
  ticket.assigneeId = null
  ticket.assigneeName = null
  ticket.updatedAt = new Date().toISOString()
  pushEvent(ticket.id, 'transferred', user.id, user.name, { fromGroupName, toGroupName: target.name })
  return ok(toDetail(user, ticket))
}

function completeTicket(user: CurrentUser, ticket: MockTicket) {
  if (user.role !== 'handler' && user.role !== 'admin') return fail(403, 'forbidden', '无权完成该工单')
  if (ticket.companyId !== user.companyId) return fail(403, 'forbidden', '无权完成该工单')
  if (ticket.status !== 'in_progress') return fail(409, 'invalid_transition', '仅待处理工单可完成')
  const now = new Date().toISOString()
  ticket.status = 'completed'
  ticket.completedAt = now
  ticket.updatedAt = now
  ticket.assigneeId = user.id
  ticket.assigneeName = user.name
  pushEvent(ticket.id, 'completed', user.id, user.name, { fromStatus: 'in_progress', toStatus: 'completed' })
  const notification: MockNotification = {
    id: id('notice'), ticketId: ticket.id, kind: 'completion', recipientEmail: ticket.submitterEmail,
    subject: `工单 ${ticket.id} 已完成`, status: 'skipped', attempt: 1, errorMessage: '未配置 SMTP', createdAt: now, sentAt: null,
  }
  notifications.push(notification)
  pushEvent(ticket.id, 'email_skipped', 'system', '系统', { status: 'skipped', recipientEmail: ticket.submitterEmail })
  return ok({ ...toDetail(user, ticket), notification: { id: notification.id, status: notification.status } })
}

function cancelTicket(user: CurrentUser, ticket: MockTicket) {
  if (ticket.status === 'completed' || ticket.status === 'cancelled') return fail(409, 'invalid_transition', '工单已结束')
  const allowed = (user.role === 'submitter' && ticket.submitterId === user.id) || ((user.role === 'handler' || user.role === 'admin') && ticket.companyId === user.companyId)
  if (!allowed) return fail(403, 'forbidden', '无权取消该工单')
  const now = new Date().toISOString()
  const fromStatus = ticket.status
  ticket.status = 'cancelled'
  ticket.cancelledAt = now
  ticket.updatedAt = now
  pushEvent(ticket.id, 'cancelled', user.id, user.name, { fromStatus, toStatus: 'cancelled' })
  return ok(toDetail(user, ticket))
}

function changePriority(user: CurrentUser, ticket: MockTicket, body: Record<string, unknown>) {
  if (user.role !== 'handler' && user.role !== 'admin') return fail(403, 'forbidden', '无权调整优先级')
  if (ticket.companyId !== user.companyId) return fail(403, 'forbidden', '无权调整优先级')
  if (ticket.status !== 'in_progress') return fail(409, 'invalid_transition', '仅待处理工单可调整优先级')
  if (!(priorities as string[]).includes(String(body.priority))) return fail(400, 'validation_error', '优先级需为 P0–P4')
  const fromPriority = ticket.priority
  ticket.priority = body.priority as TicketPriority
  ticket.updatedAt = new Date().toISOString()
  pushEvent(ticket.id, 'priority_changed', user.id, user.name, { fromPriority, toPriority: ticket.priority })
  return ok(toDetail(user, ticket))
}

function rateTicket(user: CurrentUser, ticket: MockTicket, body: Record<string, unknown>) {
  if (user.role !== 'submitter' || ticket.submitterId !== user.id) return fail(403, 'forbidden', '仅提交人本人可评价')
  if (ticket.status !== 'completed') return fail(409, 'invalid_transition', '仅已完成工单可评价')
  if (ticket.satisfactionScore !== null) return fail(409, 'already_rated', '该工单已完成评价')
  const score = Number(body.score)
  if (!Number.isInteger(score) || score < 1 || score > 5) return fail(400, 'validation_error', '评分需为 1–5')
  const now = new Date().toISOString()
  ticket.satisfactionScore = score
  ticket.satisfactionComment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null
  ticket.satisfactionAt = now
  ticket.updatedAt = now
  pushEvent(ticket.id, 'rated', user.id, user.name, { score })
  return ok(toDetail(user, ticket))
}

function resendNotification(user: CurrentUser, ticket: MockTicket, notificationId: string) {
  if (user.role !== 'handler' && user.role !== 'admin') return fail(403, 'forbidden', '无权重发通知')
  if (ticket.companyId !== user.companyId) return fail(403, 'forbidden', '无权重发通知')
  const previous = notifications.find((notification) => notification.id === notificationId && notification.ticketId === ticket.id)
  if (!previous) return fail(404, 'not_found', '通知记录不存在')
  if (previous.status === 'sent') return fail(409, 'already_sent', '该通知已发送成功')
  const now = new Date().toISOString()
  const next: MockNotification = { ...previous, id: id('notice'), status: 'sent', attempt: previous.attempt + 1, errorMessage: null, createdAt: now, sentAt: now }
  notifications.push(next)
  pushEvent(ticket.id, 'email_sent', 'system', '系统', { status: 'sent', recipientEmail: ticket.submitterEmail })
  return ok(stripTicketId([next])[0])
}

function toGroup(group: MockGroup): BusinessGroup {
  const members = group.memberIds.map((memberId) => personById(memberId)).filter((person): person is MockPerson => Boolean(person)).map((person) => ({
    userId: person.id,
    name: person.name,
    email: person.email,
    departmentName: departmentName(person.departmentId),
  }))
  return { id: group.id, name: group.name, companyId: group.companyId, memberCount: members.length, members, createdAt: group.createdAt }
}

function toRule(rule: MockRule): AssignmentRule {
  return { id: rule.id, categoryId: rule.categoryId, categoryName: categoryName(rule.categoryId), groupId: rule.groupId, groupName: groupName(rule.groupId) ?? '' }
}

function createGroup(user: CurrentUser, body: Record<string, unknown>) {
  if (user.role !== 'admin') return fail(403, 'forbidden', '仅管理员可配置业务组')
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return fail(400, 'validation_error', '业务组名称不能为空')
  if (groups.some((group) => group.companyId === user.companyId && group.name === name)) return fail(409, 'duplicate_group', '业务组名称已存在')
  const group: MockGroup = { id: id('group'), name, companyId: user.companyId, createdAt: new Date().toISOString(), memberIds: [] }
  groups.push(group)
  return ok(toGroup(group))
}

function renameGroup(group: MockGroup, body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return fail(400, 'validation_error', '业务组名称不能为空')
  if (groups.some((item) => item.companyId === group.companyId && item.name === name && item.id !== group.id)) return fail(409, 'duplicate_group', '业务组名称已存在')
  group.name = name
  return ok(toGroup(group))
}

function deleteGroup(group: MockGroup) {
  const inUse = tickets.some((ticket) => ticket.groupId === group.id && ticket.status !== 'completed' && ticket.status !== 'cancelled') || rules.some((rule) => rule.groupId === group.id)
  if (inUse) return fail(409, 'group_in_use', '业务组仍被未完成工单或分配规则引用')
  groups.splice(groups.indexOf(group), 1)
  return ok({ ok: true })
}

function addMember(group: MockGroup, body: Record<string, unknown>) {
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const person = personById(userId)
  if (!person || person.companyId !== group.companyId) return fail(400, 'validation_error', '成员须属于本公司')
  if (!group.memberIds.includes(person.id)) group.memberIds.push(person.id)
  return ok(toGroup(group))
}

function removeMember(group: MockGroup, userId: string) {
  const index = group.memberIds.indexOf(userId)
  if (index < 0) return fail(404, 'not_found', '成员不存在')
  group.memberIds.splice(index, 1)
  return ok({ ok: true })
}

function createRule(user: CurrentUser, body: Record<string, unknown>) {
  if (user.role !== 'admin') return fail(403, 'forbidden', '仅管理员可配置分配规则')
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
  const group = groups.find((item) => item.id === body.groupId)
  if (!categories.some((category) => category.id === categoryId)) return fail(400, 'validation_error', '问题分类无效')
  if (!group || group.companyId !== user.companyId) return fail(400, 'validation_error', '业务组无效')
  if (rules.some((rule) => rule.companyId === user.companyId && rule.categoryId === categoryId)) return fail(409, 'rule_exists', '该分类已存在分配规则')
  const now = new Date().toISOString()
  const rule: MockRule = { id: id('rule'), companyId: user.companyId, categoryId, groupId: group.id, createdAt: now, updatedAt: now }
  rules.push(rule)
  return ok(toRule(rule))
}

function updateRule(rule: MockRule, body: Record<string, unknown>) {
  const group = groups.find((item) => item.id === body.groupId)
  if (!group || group.companyId !== rule.companyId) return fail(400, 'validation_error', '业务组无效')
  rule.groupId = group.id
  rule.updatedAt = new Date().toISOString()
  return ok(toRule(rule))
}

function removeRule(rule: MockRule) { rules.splice(rules.indexOf(rule), 1) }

function rangeTickets(user: CurrentUser, url: URL) {
  const from = url.searchParams.get('from') ?? toDate(daysAgo(29))
  const to = url.searchParams.get('to') ?? toDate(new Date())
  const fromTime = new Date(`${from}T00:00:00.000Z`).getTime()
  const toTime = new Date(`${to}T23:59:59.999Z`).getTime()
  let result = visibleTickets(user).filter((ticket) => {
    const created = new Date(ticket.createdAt).getTime()
    return created >= fromTime && created <= toTime
  })
  const companyId = user.role === 'ops' ? url.searchParams.get('companyId') : user.companyId
  if (companyId) result = result.filter((ticket) => ticket.companyId === companyId)
  return result
}

function distribution(user: CurrentUser, url: URL): StatsDistribution {
  const dimension = url.searchParams.get('dimension') === 'department' ? 'department' : 'company'
  const scoped = rangeTickets(user, url)
  const total = scoped.length
  const companyId = user.role === 'ops' ? url.searchParams.get('companyId') : user.companyId
  const counts = new Map<string, { label: string; count: number }>()
  if (dimension === 'department' && !companyId) {
    scoped.forEach((ticket) => {
      const key = ticket.departmentId
      const entry = counts.get(key) ?? { label: `${companyName(ticket.companyId)} · ${departmentName(ticket.departmentId)}`, count: 0 }
      entry.count += 1
      counts.set(key, entry)
    })
  } else if (dimension === 'department') {
    departments.filter((department) => department.companyId === companyId).forEach((department) => counts.set(department.id, { label: department.name, count: 0 }))
    scoped.forEach((ticket) => {
      const entry = counts.get(ticket.departmentId) ?? { label: departmentName(ticket.departmentId), count: 0 }
      entry.count += 1
      counts.set(ticket.departmentId, entry)
    })
  } else {
    scoped.forEach((ticket) => {
      const entry = counts.get(ticket.companyId) ?? { label: companyName(ticket.companyId), count: 0 }
      entry.count += 1
      counts.set(ticket.companyId, entry)
    })
  }
  const items = [...counts.entries()]
    .map(([key, entry]) => ({ key, label: entry.label, count: entry.count, ratio: total === 0 ? 0 : Math.round((entry.count / total) * 10000) / 10000 }))
    .sort((left, right) => right.count - left.count)
  return { dimension, total, items }
}

function dashboard(user: CurrentUser, url: URL): StatsDashboard {
  const scoped = rangeTickets(user, url)
  const responded = scoped.filter((ticket) => ticket.firstResponseAt)
  const minutes = responded.map((ticket) => (new Date(ticket.firstResponseAt as string).getTime() - new Date(ticket.createdAt).getTime()) / 60000)
  const rated = scoped.filter((ticket) => ticket.status === 'completed' && ticket.satisfactionScore !== null)
  const average = rated.length === 0 ? null : Math.round((rated.reduce((sum, ticket) => sum + (ticket.satisfactionScore ?? 0), 0) / rated.length) * 10) / 10
  const categoryCounts = new Map<string, number>()
  scoped.forEach((ticket) => categoryCounts.set(ticket.categoryId, (categoryCounts.get(ticket.categoryId) ?? 0) + 1))
  const hotCategories = [...categoryCounts.entries()]
    .map(([categoryId, count]) => ({ categoryId, categoryName: categoryName(categoryId), count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
  const statusBreakdown = statuses.map((status) => ({ status, count: scoped.filter((ticket) => ticket.status === status).length })).filter((item) => item.count > 0)
  const priorityBreakdown = priorities.map((priority) => ({ priority, count: scoped.filter((ticket) => ticket.priority === priority).length })).filter((item) => item.count > 0)
  return {
    ticketCount: scoped.length,
    avgFirstResponseMinutes: minutes.length === 0 ? null : Math.round((minutes.reduce((sum, value) => sum + value, 0) / minutes.length) * 10) / 10,
    satisfaction: { average, ratedCount: rated.length },
    hotCategories,
    statusBreakdown,
    priorityBreakdown,
  }
}

function pushEvent(ticketId: string, action: string, actorId: string, actorName: string, detail: Record<string, unknown> | null) {
  events.push({ id: id('event'), ticketId, action, actorId, actorName, result: 'success', detail, createdAt: new Date().toISOString() })
}

function id(prefix: string) { return `${prefix}-${Math.random().toString(36).slice(2, 10)}` }

function stripTicketId<T extends { ticketId: string }>(items: T[]): Omit<T, 'ticketId'>[] {
  return items.map(({ ticketId, ...rest }) => rest)
}

function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

function daysAgoIso(days: number, hour = 9): string {
  const date = daysAgo(days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function toDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
