// 契约推导的 mock 数据集：仅用于开发阶段的渲染核对（devcheck），
// 不被应用入口引用，不进入生产构建。
import type {
  AssignmentRule,
  AuthUser,
  DashboardStats,
  DistributionStats,
  Group,
  LogEntry,
  LogListResult,
  Reply,
  SubmitterContext,
  Ticket,
  TicketDetail,
  TicketListResult,
  UserBrief,
} from '../contract'

function toBrief(user: AuthUser): UserBrief {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    companyId: user.companyId,
    companyName: user.companyName,
    departmentName: user.departmentName,
  }
}

export const handler: AuthUser = {
  id: 12,
  displayName: '李承',
  email: 'licheng@yunfan.example',
  companyId: 1,
  companyName: '云帆科技',
  departmentName: '技术支持部',
  crossCompanyView: false,
}

export const submitter: AuthUser = {
  id: 11,
  displayName: '张岚',
  email: 'zhanglan@yunfan.example',
  companyId: 1,
  companyName: '云帆科技',
  departmentName: '客户成功部',
  crossCompanyView: false,
}

export const colleague: UserBrief = {
  id: 13,
  displayName: '王倩',
  email: 'wangqian@yunfan.example',
  companyId: 1,
  companyName: '云帆科技',
  departmentName: '技术支持部',
}

export const crossViewer: AuthUser = {
  id: 15,
  displayName: '周衡',
  email: 'zhouheng@yunfan.example',
  companyId: 2,
  companyName: '澜海集团',
  departmentName: '质量与运营部',
  crossCompanyView: true,
}

export const companyUsers: UserBrief[] = [toBrief(submitter), toBrief(handler), colleague]

const submitterBrief = toBrief(submitter)
const handlerBrief = toBrief(handler)

export const groups: Group[] = [
  { id: 31, companyId: 1, name: '技术支持组', members: [handlerBrief, colleague], createdAt: '2026-10-18T02:00:00.000Z' },
  { id: 32, companyId: 1, name: '计费事务组', members: [colleague], createdAt: '2026-10-18T02:10:00.000Z' },
]

export const rules: AssignmentRule[] = [
  { id: 41, companyId: 1, category: 'bug', targetGroupId: 31, targetGroupName: '技术支持组', createdAt: '2026-10-18T02:20:00.000Z' },
  { id: 42, companyId: 1, category: 'payment', targetGroupId: 32, targetGroupName: '计费事务组', createdAt: '2026-10-18T02:25:00.000Z' },
]

export const tickets: Ticket[] = [
  {
    id: 12,
    companyId: 1,
    subject: '支付页面重复扣款',
    description: '客户在支付完成后再次点击付款按钮，出现重复扣款。\n需要在支付网关侧增加幂等校验。',
    category: 'payment',
    priority: 'P1',
    status: 'pending_processing',
    submitter: submitterBrief,
    assignedGroupId: 32,
    currentAssignee: null,
    firstReplyAt: '2026-10-20T09:12:00.000Z',
    completedBy: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-10-20T08:30:00.000Z',
    updatedAt: '2026-10-20T09:12:00.000Z',
  },
  {
    id: 13,
    companyId: 1,
    subject: '导出报表超时',
    description: '导出近 90 天的运营报表时接口持续超时。',
    category: 'performance',
    priority: 'P2',
    status: 'pending_assignment',
    submitter: submitterBrief,
    assignedGroupId: null,
    currentAssignee: null,
    firstReplyAt: null,
    completedBy: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-10-21T01:05:00.000Z',
    updatedAt: '2026-10-21T01:05:00.000Z',
  },
  {
    id: 9,
    companyId: 1,
    subject: '登录后头像未刷新',
    description: '更新头像后需要重新登录才会显示新头像。',
    category: 'bug',
    priority: 'P3',
    status: 'completed',
    submitter: submitterBrief,
    assignedGroupId: 31,
    currentAssignee: handlerBrief,
    firstReplyAt: '2026-10-15T06:20:00.000Z',
    completedBy: handlerBrief,
    completedAt: '2026-10-16T10:00:00.000Z',
    cancelledAt: null,
    createdAt: '2026-10-15T05:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
  },
  {
    id: 10,
    companyId: 1,
    subject: '新增批量导入客户功能',
    description: '希望支持 Excel 批量导入客户名单。',
    category: 'feature',
    priority: 'P4',
    status: 'cancelled',
    submitter: submitterBrief,
    assignedGroupId: null,
    currentAssignee: null,
    firstReplyAt: null,
    completedBy: null,
    completedAt: null,
    cancelledAt: '2026-10-17T08:00:00.000Z',
    createdAt: '2026-10-16T09:00:00.000Z',
    updatedAt: '2026-10-17T08:00:00.000Z',
  },
]

const replies: Reply[] = [
  { id: 51, ticketId: 12, replier: submitterBrief, content: '问题今天上午再次出现，附上订单号 8827。', createdAt: '2026-10-20T08:35:00.000Z' },
  { id: 52, ticketId: 12, replier: handlerBrief, content: '已确认是幂等键缺失，正在修复，预计今天内上线。', createdAt: '2026-10-20T09:12:00.000Z' },
  { id: 53, ticketId: 12, replier: submitterBrief, content: '收到，感谢跟进。', createdAt: '2026-10-20T09:40:00.000Z' },
]

export const ticketDetail: TicketDetail = { ticket: tickets[0], replies, rating: null }

export const completedDetail: TicketDetail = {
  ticket: tickets[2],
  replies: [
    { id: 61, ticketId: 9, replier: handlerBrief, content: '已定位为头像缓存未失效，修复已发布。', createdAt: '2026-10-15T06:20:00.000Z' },
  ],
  rating: { score: 5, createdAt: '2026-10-16T12:00:00.000Z' },
}

export const submitterContext: SubmitterContext = {
  name: '张岚',
  email: 'zhanglan@yunfan.example',
  companyName: '云帆科技',
  departmentName: '客户成功部',
  historyTickets: [
    { id: 12, subject: '支付页面重复扣款', status: 'pending_processing', category: 'payment', priority: 'P1', createdAt: '2026-10-20T08:30:00.000Z' },
    { id: 9, subject: '登录后头像未刷新', status: 'completed', category: 'bug', priority: 'P3', createdAt: '2026-10-15T05:00:00.000Z' },
  ],
}

export const ticketLogs: LogEntry[] = [
  { id: 71, action: 'ticket_created', actor: submitterBrief, createdAt: '2026-10-20T08:30:00.000Z', ticketId: 12, detail: '张岚 创建工单 #12' },
  { id: 72, action: 'ticket_assigned', actor: 'system', createdAt: '2026-10-20T08:30:00.000Z', ticketId: 12, detail: '按分类 payment 自动分配至 计费事务组' },
  { id: 73, action: 'ticket_replied', actor: handlerBrief, createdAt: '2026-10-20T09:12:00.000Z', ticketId: 12, detail: '李承 回复工单' },
]

export const workbenchList: TicketListResult = { items: [tickets[0], tickets[1]], total: 2, page: 1, pageSize: 20 }
export const mineList: TicketListResult = { items: tickets, total: 4, page: 1, pageSize: 20 }
export const emptyList: TicketListResult = { items: [], total: 0, page: 1, pageSize: 20 }

export const dashboard: DashboardStats = {
  ticketCount: { total: 48, byStatus: { created: 0, pending_assignment: 5, pending_processing: 12, completed: 28, cancelled: 3 } },
  avgResponseMinutes: 38.5,
  satisfaction: { avgScore: 4.4, ratedCount: 19 },
  hotCategories: [
    { category: 'bug', count: 14 },
    { category: 'payment', count: 11 },
    { category: 'account', count: 9 },
    { category: 'performance', count: 7 },
    { category: 'feature', count: 4 },
    { category: 'other', count: 3 },
  ],
}

export const companyDistribution: DistributionStats = {
  dimension: 'company',
  items: [
    { key: 1, label: '云帆科技', count: 48 },
    { key: 2, label: '澜海集团', count: 22 },
  ],
}

export const departmentDistribution: DistributionStats = {
  dimension: 'department',
  items: [
    { key: '客户成功部', label: '客户成功部', count: 18 },
    { key: '技术支持部', label: '技术支持部', count: 12 },
    { key: '未分配部门', label: '未分配部门', count: 6 },
  ],
}

export const emptyDistribution: DistributionStats = { dimension: 'department', items: [] }

export const logList: LogListResult = {
  items: [
    { id: 81, action: 'ticket_completed', actor: handlerBrief, createdAt: '2026-10-20T10:00:00.000Z', ticketId: 12, detail: '李承 完成工单 #12' },
    { id: 82, action: 'notification_failed', actor: 'system', createdAt: '2026-10-20T10:00:01.000Z', ticketId: 12, detail: '完成通知邮件发送失败：SMTP 不可用' },
    { id: 83, action: 'ticket_rated', actor: submitterBrief, createdAt: '2026-10-20T12:00:00.000Z', ticketId: 12, detail: '张岚 评价工单 4 分' },
  ],
  total: 3,
  page: 1,
  pageSize: 20,
}

export const emptyLogList: LogListResult = { items: [], total: 0, page: 1, pageSize: 20 }
