// 开发阶段契约渲染核对工具（不进入生产构建：应用入口不引用本目录）。
// 运行方式（应用包根目录）：node --import tsx src/client/devcheck/run.tsx
// 核对内容：各页面视图在契约推导 mock 数据下的渲染，以及
// 加载 / 空数据 / 错误 / 无权限（COMPANY_FORBIDDEN）状态的反馈呈现。
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { SessionProvider } from '../app/session'
import type { AsyncHandle } from '../app/useAsyncData'
import { AppShell } from '../components/AppShell'
import { buildLogQuery, buildTicketQuery, type TicketAction } from '../contract'
import { categoryLabel, formatDateTime, formatMinutes } from '../labels'
import { ApiRequestError, describeError } from '../platform/api-client'
import LoginPage from '../pages/LoginPage'
import { DEFAULT_WORKBENCH_FILTERS, WorkbenchListPanel, type WorkbenchFilters } from '../pages/WorkbenchPage'
import { TicketDetailView, type TicketDetailViewProps } from '../pages/TicketDetailView'
import { CreateTicketCard, MyTicketsListCard, type MyTicketsListCardProps } from '../pages/MyTicketsPage'
import { AssignmentView } from '../pages/AssignmentPage'
import { StatsView } from '../pages/StatsPage'
import { LogsView } from '../pages/LogsPage'
import * as mock from './mockData'

interface CheckResult {
  name: string
  pass: boolean
  note?: string
}

const results: CheckResult[] = []

function checkContains(name: string, html: string, needles: string[]) {
  const missing = needles.filter((needle) => !html.includes(needle))
  results.push(
    missing.length === 0
      ? { name, pass: true }
      : { name, pass: false, note: `缺少标记：${missing.join('、')}` },
  )
}

function checkAbsent(name: string, html: string, needles: string[]) {
  const present = needles.filter((needle) => html.includes(needle))
  results.push(
    present.length === 0
      ? { name, pass: true }
      : { name, pass: false, note: `不应出现的标记：${present.join('、')}` },
  )
}

function checkEqual<T>(name: string, actual: T, expected: T) {
  results.push(
    actual === expected
      ? { name, pass: true }
      : { name, pass: false, note: `实际值 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}` },
  )
}

function checkTrue(name: string, condition: boolean, note?: string) {
  results.push(condition ? { name, pass: true } : { name, pass: false, note: note ?? '条件为假' })
}

const noop = () => {}
const asyncTrue = async () => true

function readyHandle<T>(data: T): AsyncHandle<T> {
  return { phase: 'ready', data, reload: noop }
}
function loadingHandle<T>(): AsyncHandle<T> {
  return { phase: 'loading', reload: noop }
}
function errorHandle<T>(error: unknown): AsyncHandle<T> {
  return { phase: 'error', error, reload: noop }
}

function render(node: ReactNode): string {
  return renderToString(<MemoryRouter>{node}</MemoryRouter>)
}

const forbiddenError = new ApiRequestError('无权访问其他公司的工单', 403, 'COMPANY_FORBIDDEN')
const serverError = new ApiRequestError('服务暂时不可用', 500, 'INTERNAL_ERROR')

// ---------------------------------------------------------------------------
// 1. 应用壳与登录
// ---------------------------------------------------------------------------

const shellHtml = render(
  <AppShell user={mock.handler} onSignOut={noop}>
    <p>主工作区</p>
  </AppShell>,
)
checkContains('应用壳：导航与用户上下文', shellHtml, [
  '工单工作台', '我的工单', '分配配置', '统计分析', '操作日志', '李承', '云帆科技', '退出登录', '主工作区',
])

const loginHtml = renderToString(
  <MemoryRouter>
    <SessionProvider>
      <LoginPage />
    </SessionProvider>
  </MemoryRouter>,
)
checkContains('登录页：用户名密码表单', loginHtml, ['用户名', '密码', '登录', '工单系统'])

// ---------------------------------------------------------------------------
// 2. 工单工作台（split-master-detail 左列）
// ---------------------------------------------------------------------------

const defaultFilters: WorkbenchFilters = { ...DEFAULT_WORKBENCH_FILTERS }

function renderWorkbenchList(me: { crossCompanyView: boolean }, list: AsyncHandle<typeof mock.workbenchList>, companyOptions: AsyncHandle<typeof mock.companyDistribution> | null, selectedTicketId: number | null) {
  return render(
    <WorkbenchListPanel
      me={me}
      filters={defaultFilters}
      onFiltersChange={noop}
      searchDraft=""
      onSearchDraftChange={noop}
      onSearchSubmit={noop}
      onSearchClear={noop}
      companyOptions={companyOptions}
      list={list}
      onPageChange={noop}
      selectedTicketId={selectedTicketId}
      onSelectTicket={noop}
    />,
  )
}

checkContains('工作台：列表与筛选就绪', renderWorkbenchList(mock.handler, readyHandle(mock.workbenchList), null, 12), [
  '工单列表', '支付页面重复扣款', '导出报表超时', '待处理', '待分配', 'P1', 'P2', '支付', '性能',
  '张岚', '共 2 条', '状态', '分类', '优先级', '排序', '搜索主题', '待处理工单', '待分配工单', '上一页', '下一页',
])

checkContains(
  '工作台：跨公司用户的公司筛选',
  renderWorkbenchList(mock.crossViewer, readyHandle(mock.workbenchList), readyHandle(mock.companyDistribution), null),
  ['field-label">公司</span>', '全部公司', '云帆科技', '澜海集团', '张岚 · 云帆科技'],
)

checkAbsent(
  '工作台：普通用户隐藏公司筛选',
  renderWorkbenchList(mock.handler, readyHandle(mock.workbenchList), null, null),
  ['field-label">公司</span>', '全部公司'],
)

checkContains('工作台：加载状态', renderWorkbenchList(mock.handler, loadingHandle(), null, null), ['加载中'])
checkContains('工作台：空数据状态', renderWorkbenchList(mock.handler, readyHandle(mock.emptyList), null, null), [
  '暂无数据', '当前筛选条件下没有工单',
])
checkContains('工作台：错误状态', renderWorkbenchList(mock.handler, errorHandle(serverError), null, null), ['加载失败', '重试'])
checkContains('工作台：无权限状态', renderWorkbenchList(mock.handler, errorHandle(forbiddenError), null, null), ['无权访问其他公司的工单'])

// ---------------------------------------------------------------------------
// 3. 处理视图（详情：回复流、提交人信息区、操作、评价、日志）
// ---------------------------------------------------------------------------

const baseDetailProps: TicketDetailViewProps = {
  me: mock.handler,
  mode: 'workbench',
  detail: readyHandle(mock.ticketDetail),
  logs: readyHandle(mock.ticketLogs),
  submitterContext: readyHandle(mock.submitterContext),
  users: readyHandle(mock.companyUsers),
  groups: null,
  feedback: null,
  busyAction: null,
  onClaim: noop,
  onReply: asyncTrue,
  onTransfer: noop,
  onComplete: noop,
  onCancel: noop,
  onAssign: noop,
  onRate: asyncTrue,
  onOpenTicket: noop,
}

checkContains('处理视图：回复流与提交人信息区', render(<TicketDetailView {...baseDetailProps} />), [
  '#12', '支付页面重复扣款', '提交人信息（处理上下文）', '历史工单（2）', '张岚', '客户成功部',
  '已确认是幂等键缺失，正在修复，预计今天内上线', '收到，感谢跟进', '回复记录（3）',
  '接单', '完成处理', '提交回复', '操作日志', '创建工单', '分配工单', '回复工单',
  '首次回复', '当前处理人', '支付页面重复扣款',
])

checkContains(
  '处理视图：当前处理人可转派',
  render(
    <TicketDetailView
      {...baseDetailProps}
      detail={readyHandle({
        ticket: { ...mock.ticketDetail.ticket, currentAssignee: mock.handler },
        replies: mock.ticketDetail.replies,
        rating: null,
      })}
    />,
  ),
  ['转派', '选择转派目标', '王倩', '张岚（客户成功部）'],
)

checkContains(
  '处理视图：完成通知失败反馈',
  render(
    <TicketDetailView
      {...baseDetailProps}
      feedback={{ tone: 'warning', message: '工单已完成，但邮件通知发送失败：SMTP 不可用' }}
    />,
  ),
  ['工单已完成，但邮件通知发送失败', 'SMTP 不可用'],
)

checkContains(
  '处理视图：待分配工单人工分配',
  render(
    <TicketDetailView
      {...baseDetailProps}
      detail={readyHandle({ ticket: mock.tickets[1], replies: [], rating: null })}
      groups={readyHandle(mock.groups)}
    />,
  ),
  ['人工分配到业务组', '技术支持组', '计费事务组', '分配', '未分配'],
)

const mineDetailProps: TicketDetailViewProps = {
  ...baseDetailProps,
  me: mock.submitter,
  mode: 'mine',
  detail: readyHandle(mock.completedDetail),
  submitterContext: null,
  users: null,
  groups: null,
  onBack: noop,
  backLabel: '返回我的工单',
}

checkContains('我的工单详情：已完成评价展示', render(<TicketDetailView {...mineDetailProps} />), [
  '满意度评价', '5 / 5 分', '完成时间', '处理完成人', '返回我的工单', '工单已完成，回复已关闭',
])

checkContains(
  '我的工单详情：待评价表单',
  render(<TicketDetailView {...mineDetailProps} detail={readyHandle({ ticket: mock.completedDetail.ticket, replies: mock.completedDetail.replies, rating: null })} />),
  ['提交评价', '5 分', '暂未评价'],
)

checkContains(
  '处理视图：无权限反馈',
  render(<TicketDetailView {...baseDetailProps} detail={errorHandle(forbiddenError)} />),
  ['无权访问其他公司的工单'],
)

checkContains(
  '处理视图：跨公司视角仅可查看',
  render(<TicketDetailView {...baseDetailProps} me={mock.crossViewer} users={null} />),
  ['跨公司视角下仅可查看该工单'],
)

// ---------------------------------------------------------------------------
// 4. 我的工单（创建表单 + 全状态列表）
// ---------------------------------------------------------------------------

const mineListProps: MyTicketsListCardProps = {
  list: readyHandle(mock.mineList),
  status: '',
  onStatusChange: noop,
  searchDraft: '',
  onSearchDraftChange: noop,
  onSearchSubmit: noop,
  onSearchClear: noop,
  appliedSearch: '',
  sort: 'createdAt',
  onSortChange: noop,
  order: 'desc',
  onOrderToggle: noop,
  onPageChange: noop,
  onSelectTicket: noop,
}

checkContains(
  '我的工单：创建表单与全状态列表',
  render(
    <>
      <CreateTicketCard onSubmit={noop} busy={false} feedback={null} />
      <MyTicketsListCard {...mineListProps} />
    </>,
  ),
  [
    '提交工单', '主题', '描述', '分类', 'SLA 优先级', '选择问题分类', '选择优先级',
    '我的工单', '支付页面重复扣款', '导出报表超时', '登录后头像未刷新', '新增批量导入客户功能',
    '完成', '取消', '全部状态', '共 4 条',
  ],
)

checkContains(
  '我的工单：空数据状态',
  render(<MyTicketsListCard {...mineListProps} list={readyHandle(mock.emptyList)} />),
  ['暂无数据', '你还没有提交过工单'],
)

checkContains(
  '我的工单：创建失败反馈',
  render(<CreateTicketCard onSubmit={noop} busy={false} feedback={{ tone: 'error', message: '主题不能为空' }} />),
  ['主题不能为空', '提交工单'],
)

// ---------------------------------------------------------------------------
// 5. 分配配置
// ---------------------------------------------------------------------------

const assignmentHtml = render(
  <AssignmentView
    groups={readyHandle(mock.groups)}
    users={readyHandle(mock.companyUsers)}
    rules={readyHandle(mock.rules)}
    feedback={null}
    busy={null}
    onCreateGroup={asyncTrue}
    onUpdateGroup={asyncTrue}
    onDeleteGroup={async () => {}}
    onCreateRule={asyncTrue}
    onDeleteRule={async () => {}}
  />,
)
checkContains('分配配置：业务组与规则', assignmentHtml, [
  '业务组与成员', '技术支持组', '计费事务组', '李承', '王倩', '创建业务组',
  '分类自动分配规则', '缺陷', '支付', '已有规则', '创建规则', '删除', '成员（成员即该组工单的处理人）',
])

checkContains(
  '分配配置：空数据状态',
  render(
    <AssignmentView
      groups={readyHandle([])}
      users={readyHandle([])}
      rules={readyHandle([])}
      feedback={null}
      busy={null}
      onCreateGroup={asyncTrue}
      onUpdateGroup={asyncTrue}
      onDeleteGroup={async () => {}}
      onCreateRule={asyncTrue}
      onDeleteRule={async () => {}}
    />,
  ),
  ['暂无数据', '尚未创建业务组', '尚未配置规则', '暂无成员'],
)

checkContains(
  '分配配置：操作错误反馈',
  render(
    <AssignmentView
      groups={readyHandle(mock.groups)}
      users={readyHandle(mock.companyUsers)}
      rules={readyHandle(mock.rules)}
      feedback={{ tone: 'error', message: '业务组已被分配规则引用，需先删除规则' }}
      busy={null}
      onCreateGroup={asyncTrue}
      onUpdateGroup={asyncTrue}
      onDeleteGroup={async () => {}}
      onCreateRule={asyncTrue}
      onDeleteRule={async () => {}}
    />,
  ),
  ['业务组已被分配规则引用', '需先删除规则'],
)

// ---------------------------------------------------------------------------
// 6. 统计分析
// ---------------------------------------------------------------------------

const crossStatsHtml = render(
  <StatsView
    me={mock.crossViewer}
    dashboard={readyHandle(mock.dashboard)}
    distribution={readyHandle(mock.companyDistribution)}
    dimension="company"
    onDimensionChange={noop}
    companyScope={undefined}
    onCompanyScopeChange={noop}
    companyOptions={readyHandle(mock.companyDistribution)}
  />,
)
checkContains('统计分析：仪表盘与公司分布（跨公司）', crossStatsHtml, [
  '工单量', '平均响应时间', '满意度', '热点问题', '38.5 分钟', '4.4 / 5', '19 条评价',
  '缺陷', '按公司', '按部门', '云帆科技', '澜海集团', '全部公司', '统计范围',
])

const plainStatsHtml = render(
  <StatsView
    me={mock.handler}
    dashboard={readyHandle(mock.dashboard)}
    distribution={readyHandle(mock.departmentDistribution)}
    dimension="department"
    onDimensionChange={noop}
    companyScope={undefined}
    onCompanyScopeChange={noop}
    companyOptions={null}
  />,
)
checkContains('统计分析：普通用户部门维度', plainStatsHtml, ['客户成功部', '技术支持部', '未分配部门'])
checkContains('统计分析：公司维度受限反馈', plainStatsHtml, ['公司维度需跨公司视角权限'])
checkAbsent('统计分析：普通用户无公司范围控件', plainStatsHtml, ['全部公司'])
checkTrue('统计分析：普通用户公司维度按钮禁用', plainStatsHtml.includes('disabled'))

checkContains(
  '统计分析：分布空数据状态',
  render(
    <StatsView
      me={mock.handler}
      dashboard={readyHandle(mock.dashboard)}
      distribution={readyHandle(mock.emptyDistribution)}
      dimension="department"
      onDimensionChange={noop}
      companyScope={undefined}
      onCompanyScopeChange={noop}
      companyOptions={null}
    />,
  ),
  ['暂无数据', '暂无分布数据'],
)

// ---------------------------------------------------------------------------
// 7. 操作日志
// ---------------------------------------------------------------------------

const logsHtml = render(
  <LogsView me={mock.handler} logs={readyHandle(mock.logList)} companyOptions={null} onApplyFilters={noop} onPageChange={noop} />,
)
checkContains('操作日志：查询与列表', logsHtml, [
  '操作日志', '工单ID', '操作类型', '全部操作', '完成工单', '通知发送失败', '评价工单',
  '系统', '李承', '#12', 'SMTP 不可用', '查询', '重置', '共 3 条',
])

const crossLogsHtml = render(
  <LogsView me={mock.crossViewer} logs={readyHandle(mock.logList)} companyOptions={readyHandle(mock.companyDistribution)} onApplyFilters={noop} onPageChange={noop} />,
)
checkContains('操作日志：跨公司公司过滤', crossLogsHtml, ['公司', '全部公司', '澜海集团'])

checkContains(
  '操作日志：空数据状态',
  render(<LogsView me={mock.handler} logs={readyHandle(mock.emptyLogList)} companyOptions={null} onApplyFilters={noop} onPageChange={noop} />),
  ['暂无数据', '没有符合条件的日志记录'],
)

checkContains(
  '操作日志：无权限状态',
  render(<LogsView me={mock.handler} logs={errorHandle(forbiddenError)} companyOptions={null} onApplyFilters={noop} onPageChange={noop} />),
  ['无权访问其他公司的工单'],
)

// ---------------------------------------------------------------------------
// 8. 纯函数核对（查询构造、格式化、错误描述）
// ---------------------------------------------------------------------------

checkEqual(
  '查询构造：工作台默认参数',
  buildTicketQuery({ scope: 'workbench', status: 'pending_processing', sort: 'createdAt', order: 'desc', page: 1, pageSize: 20 }),
  'scope=workbench&status=pending_processing&sort=createdAt&order=desc&page=1&pageSize=20',
)

checkEqual(
  '查询构造：筛选与搜索',
  buildTicketQuery({ scope: 'mine', category: 'bug', priority: 'P1', companyId: 2, q: '支付', sort: 'priority', order: 'asc', page: 3, pageSize: 20 }),
  'scope=mine&category=bug&priority=P1&companyId=2&q=%E6%94%AF%E4%BB%98&sort=priority&order=asc&page=3&pageSize=20',
)

checkEqual(
  '查询构造：空值省略',
  buildTicketQuery({ scope: 'mine', sort: 'createdAt', order: 'desc', page: 1, pageSize: 20 }),
  'scope=mine&sort=createdAt&order=desc&page=1&pageSize=20',
)

checkEqual(
  '查询构造：日志过滤',
  buildLogQuery({ ticketId: 12, action: 'ticket_replied' as TicketAction, page: 2, pageSize: 20 }),
  'ticketId=12&action=ticket_replied&page=2&pageSize=20',
)

checkEqual('时间格式：空值', formatDateTime(null), '—')
checkTrue('时间格式：本地日期时间格式', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(formatDateTime('2026-10-21T08:30:00.000Z')))
checkEqual('平均响应：空值', formatMinutes(null), '暂无数据')
checkEqual('平均响应：整数', formatMinutes(38), '38 分钟')
checkEqual('平均响应：小数', formatMinutes(38.46), '38.5 分钟')
checkEqual('分类标签：已知', categoryLabel('payment'), '支付')
checkEqual('分类标签：未知保留原值', categoryLabel('custom-x'), 'custom-x')
checkEqual('错误描述：ApiRequestError', describeError(forbiddenError), '无权访问其他公司的工单')
checkEqual('错误描述：未知错误', describeError('boom'), '请求失败，请稍后重试')

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

const failed = results.filter((result) => !result.pass)
for (const result of results) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}${result.note === undefined ? '' : ` —— ${result.note}`}`)
}
console.log(`\n共 ${results.length} 项检查：${results.length - failed.length} 通过，${failed.length} 失败`)
if (failed.length > 0) {
  throw new Error(`客户端契约渲染核对未通过：${failed.map((result) => result.name).join('、')}`)
}
console.log('客户端契约渲染核对全部通过')
