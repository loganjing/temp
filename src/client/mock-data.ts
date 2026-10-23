/**
 * Mock data for development and preview rendering.
 * All data conforms to contract-based types from technical-contract.md.
 * This module is imported only when the backend is unreachable so the
 * UI can render for development. It does not fake API authorization or
 * company isolation — those remain server-side responsibilities.
 */

import type {
  Ticket,
  TicketDetail,
  BusinessGroup,
  AssignmentRule,
  StatisticsOverview,
  DistributionResponse,
  HotTopicsResponse,
  TicketLog,
  Category,
  TicketReply,
  SubmitterInfo,
  AuthUser,
} from './types';

export const mockCategories: Category[] = [
  { id: 1, name: '网络故障' },
  { id: 2, name: '系统权限' },
  { id: 3, name: '硬件设备' },
  { id: 4, name: '软件安装' },
  { id: 5, name: '账户问题' },
];

export const mockUser: AuthUser = {
  id: 3,
  name: '王管理',
  email: 'admin@example.com',
  companyId: 1,
  departmentId: 1,
  roles: ['admin'],
};

export const mockTickets: Ticket[] = [
  {
    id: 101,
    title: '无法连接公司VPN',
    description: '出差期间无法连接公司VPN，已尝试重启路由器。',
    categoryId: 1,
    categoryName: '网络故障',
    submitterId: 1,
    submitterName: '张三',
    companyId: 1,
    companyName: '科技有限公司',
    slaPriority: 'P1',
    status: 'pending_processing',
    handlerId: 2,
    handlerName: '李四',
    businessGroupId: 1,
    businessGroupName: '网络运维组',
    createdBy: '张三',
    createdAt: '2026-10-20T09:30:00.000Z',
    completedAt: null,
  },
  {
    id: 102,
    title: '申请增加ERP系统权限',
    description: '新入职员工需要ERP系统的报表查看权限。',
    categoryId: 2,
    categoryName: '系统权限',
    submitterId: 1,
    submitterName: '张三',
    companyId: 1,
    companyName: '科技有限公司',
    slaPriority: 'P3',
    status: 'pending_processing',
    handlerId: 2,
    handlerName: '李四',
    businessGroupId: 2,
    businessGroupName: '系统支持组',
    createdBy: '张三',
    createdAt: '2026-10-20T14:00:00.000Z',
    completedAt: null,
  },
  {
    id: 103,
    title: '办公电脑蓝屏无法开机',
    description: '工位电脑开机蓝屏，影响日常工作。',
    categoryId: 3,
    categoryName: '硬件设备',
    submitterId: 5,
    submitterName: '赵六',
    companyId: 1,
    companyName: '科技有限公司',
    slaPriority: 'P0',
    status: 'pending_assignment',
    handlerId: null,
    handlerName: null,
    businessGroupId: null,
    createdBy: '赵六',
    createdAt: '2026-10-21T08:15:00.000Z',
    completedAt: null,
  },
  {
    id: 104,
    title: '安装Photoshop报错',
    description: '安装PS时提示缺少运行库，无法完成安装。',
    categoryId: 4,
    categoryName: '软件安装',
    submitterId: 5,
    submitterName: '赵六',
    companyId: 1,
    companyName: '科技有限公司',
    slaPriority: 'P2',
    status: 'completed',
    handlerId: 4,
    handlerName: '孙七',
    businessGroupId: 2,
    businessGroupName: '系统支持组',
    createdBy: '赵六',
    createdAt: '2026-10-18T10:00:00.000Z',
    completedAt: '2026-10-19T15:30:00.000Z',
  },
  {
    id: 105,
    title: '邮箱登录异常',
    description: '公司邮箱无法登录，提示密码错误但确认密码正确。',
    categoryId: 5,
    categoryName: '账户问题',
    submitterId: 1,
    submitterName: '张三',
    companyId: 1,
    companyName: '科技有限公司',
    slaPriority: 'P1',
    status: 'cancelled',
    handlerId: null,
    handlerName: null,
    businessGroupId: 1,
    businessGroupName: '网络运维组',
    createdBy: '张三',
    createdAt: '2026-10-17T11:00:00.000Z',
    completedAt: null,
  },
];

export const mockReplies: TicketReply[] = [
  {
    id: 1,
    ticketId: 101,
    replierId: 1,
    replierName: '张三',
    content: '请在处理前告知预计恢复时间。',
    createdAt: '2026-10-20T09:35:00.000Z',
  },
  {
    id: 2,
    ticketId: 101,
    replierId: 2,
    replierName: '李四',
    content: '收到，正在排查VPN网关配置，预计30分钟内恢复。',
    createdAt: '2026-10-20T09:45:00.000Z',
  },
  {
    id: 3,
    ticketId: 101,
    replierId: 1,
    replierName: '张三',
    content: '好的，等待您的回复。',
    createdAt: '2026-10-20T10:00:00.000Z',
  },
];

export const mockTicketDetail: TicketDetail = {
  ...mockTickets[0],
  replies: mockReplies,
  evaluation: null,
};

export const mockSubmitterInfo: SubmitterInfo = {
  userId: 1,
  name: '张三',
  email: 'zhangsan@example.com',
  companyName: '科技有限公司',
  departmentName: '研发部',
  historyTickets: [
    {
      id: 105,
      title: '邮箱登录异常',
      status: 'cancelled',
      createdAt: '2026-10-17T11:00:00.000Z',
    },
    {
      id: 102,
      title: '申请增加ERP系统权限',
      status: 'pending_processing',
      createdAt: '2026-10-20T14:00:00.000Z',
    },
  ],
};

export const mockBusinessGroups: BusinessGroup[] = [
  {
    id: 1,
    companyId: 1,
    name: '网络运维组',
    members: [
      { id: 1, userId: 2, userName: '李四', userEmail: 'lisi@example.com' },
      { id: 2, userId: 4, userName: '孙七', userEmail: 'sunqi@example.com' },
    ],
  },
  {
    id: 2,
    companyId: 1,
    name: '系统支持组',
    members: [
      { id: 3, userId: 4, userName: '孙七', userEmail: 'sunqi@example.com' },
    ],
  },
];

export const mockAssignmentRules: AssignmentRule[] = [
  {
    id: 1,
    companyId: 1,
    categoryId: 1,
    categoryName: '网络故障',
    targetGroupId: 1,
    targetGroupName: '网络运维组',
  },
  {
    id: 2,
    companyId: 1,
    categoryId: 2,
    categoryName: '系统权限',
    targetGroupId: 2,
    targetGroupName: '系统支持组',
  },
  {
    id: 3,
    companyId: 1,
    categoryId: 5,
    categoryName: '账户问题',
    targetGroupId: 1,
    targetGroupName: '网络运维组',
  },
];

export const mockStatisticsOverview: StatisticsOverview = {
  totalTickets: 120,
  completedTickets: 95,
  pendingTickets: 18,
  cancelledTickets: 7,
  averageResponseTimeMinutes: 145,
  averageSatisfaction: 4.3,
  satisfactionCount: 78,
};

export const mockDistribution: DistributionResponse = {
  dimension: 'company',
  items: [
    { label: '科技有限公司', total: 80, completed: 65, pending: 12, cancelled: 3 },
    { label: '制造集团', total: 40, completed: 30, pending: 6, cancelled: 4 },
  ],
};

export const mockHotTopics: HotTopicsResponse = {
  items: [
    { categoryId: 1, categoryName: '网络故障', ticketCount: 35 },
    { categoryId: 2, categoryName: '系统权限', ticketCount: 28 },
    { categoryId: 3, categoryName: '硬件设备', ticketCount: 20 },
    { categoryId: 4, categoryName: '软件安装', ticketCount: 15 },
    { categoryId: 5, categoryName: '账户问题', ticketCount: 22 },
  ],
};

export const mockTicketLogs: TicketLog[] = [
  {
    id: 'log-1',
    action: 'created',
    operatorId: 1,
    operatorName: '张三',
    operatorTime: '2026-10-20T09:30:00.000Z',
    details: '{"title":"无法连接公司VPN"}',
  },
  {
    id: 'log-2',
    action: 'assigned',
    operatorId: 0,
    operatorName: '系统',
    operatorTime: '2026-10-20T09:30:01.000Z',
    details: '{"ruleId":1,"targetGroupId":1}',
  },
  {
    id: 'log-3',
    action: 'transferred',
    operatorId: 2,
    operatorName: '李四',
    operatorTime: '2026-10-20T09:45:00.000Z',
    details: '{"fromUserId":null,"toUserId":2}',
  },
];
