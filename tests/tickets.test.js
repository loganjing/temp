import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, assertErrorShape } from './helpers.js';

/**
 * 工单生命周期与交互 API 验收测试（契约第 3 节，AC-01/02/03/05/06/08/09）：
 * 创建（命中/未命中规则）、详情、列表、dispatch、assign、replies、
 * reassign、complete、cancel、rating。
 *
 * 种子用户：1 王管理(公司1管理员) 2 李提交(公司1) 3 赵网络(公司1)
 *          4 钱软件(公司1) 5 孙管理(公司2管理员) 6 周提交(公司2) 7 吴处理(公司2)
 * 种子分类：1 网络问题 2 软件问题 3 硬件问题 4 账号权限 5 其他
 */

let server;
let netGroupId; // 公司 1「网络组」
let softGroupId; // 公司 1「软件组」
let otherCompanyGroupId; // 公司 2「远航运维组」

before(async () => {
  server = await startServer();
  // 准备：公司 1 配置「网络问题 → 网络组」「软件问题 → 软件组」两条规则与成员
  const net = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '网络组' },
  });
  assert.equal(net.status, 201);
  netGroupId = net.body.id;
  await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 1,
    body: { userIds: [3, 4] },
  });

  const soft = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '软件组' },
  });
  softGroupId = soft.body.id;
  await server.api('PUT', `/api/business-groups/${softGroupId}/members`, {
    userId: 1,
    body: { userIds: [4] },
  });

  await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 1, groupId: netGroupId },
  });
  await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 2, groupId: softGroupId },
  });

  const other = await server.api('POST', '/api/companies/2/business-groups', {
    userId: 5,
    body: { name: '远航运维组' },
  });
  otherCompanyGroupId = other.body.id;
});

after(async () => {
  await server.stop();
});

test('创建工单：未命中分配规则时停留 created，字段完整（AC-01）', async (t) => {
  const test = assert;
  const res = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: {
      subject: '打印机故障',
      description: '三楼打印机无法开机',
      categoryId: 3,
      priority: 'P2',
    },
  });
  test.equal(res.status, 201);
  const ticket = res.body;
  test.equal(ticket.ticketNo, 'TK-0001');
  test.equal(ticket.subject, '打印机故障');
  test.equal(ticket.description, '三楼打印机无法开机');
  test.deepEqual(ticket.category, { id: 3, name: '硬件问题' });
  test.equal(ticket.priority, 'P2');
  test.equal(ticket.status, 'created');
  test.equal(ticket.submitter.id, 2);
  test.equal(ticket.submitter.name, '李提交');
  test.equal(ticket.submitter.email, 'submitter.li@nebula.example');
  test.deepEqual(ticket.submitter.company, { id: 1, name: '星云科技' });
  test.equal(ticket.submitter.department, '市场部');
  test.equal(ticket.submitter.isCompanyAdmin, false);
  test.equal(ticket.assignedGroup, null);
  test.equal(ticket.assignee, null);
  test.ok(isoPattern.test(ticket.createdAt), 'createdAt 应为 ISO 8601 UTC');
  test.ok(isoPattern.test(ticket.updatedAt));
  test.equal(ticket.completedAt, null);
  test.equal(ticket.completedBy, null);
  test.equal(ticket.replyCount, 0);
  test.equal(ticket.rating, null);
  test.deepEqual(ticket.replies, []);
  test.equal(ticket.events.length, 1);
  test.equal(ticket.events[0].type, 'created');
  test.equal(ticket.events[0].actor.id, 2);
  test.deepEqual(ticket.events[0].detail, {});
  test.ok(isoPattern.test(ticket.events[0].createdAt));

  // 详情读回全部字段（AC-01：创建成功后可通过详情读回）
  const detail = await server.api('GET', `/api/tickets/${ticket.id}`, { userId: 1 });
  test.equal(detail.status, 200);
  test.equal(detail.body.ticketNo, 'TK-0001');
  test.equal(detail.body.subject, '打印机故障');
  test.equal(detail.body.status, 'created');
  test.equal(detail.body.submitter.email, 'submitter.li@nebula.example');
});

const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('创建工单：请求校验错误 400', async (t) => {
  const test = assert;
  const cases = [
    { userId: 2, body: { description: 'x', categoryId: 3, priority: 'P2' } },
    { userId: 2, body: { subject: '  ', categoryId: 3, priority: 'P2' } },
    { userId: 2, body: { subject: 's', categoryId: 3 } },
    { userId: 2, body: { subject: 's', categoryId: 999, priority: 'P2' } },
    { userId: 2, body: { subject: 's', categoryId: 3, priority: 'P9' } },
  ];
  for (const c of cases) {
    const res = await server.api('POST', '/api/tickets', c);
    assertErrorShape(assert, res, 400, 'VALIDATION_ERROR');
  }
});

test('创建工单：命中规则自动直达 processing（AC-05）', async (t) => {
  const test = assert;
  const res = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: {
      subject: '无法访问内网',
      description: '办公区网络中断',
      categoryId: 1,
      priority: 'P1',
    },
  });
  test.equal(res.status, 201);
  const ticket = res.body;
  test.equal(ticket.status, 'processing');
  test.deepEqual(ticket.assignedGroup, { id: netGroupId, name: '网络组' });
  test.deepEqual(ticket.assignee, { id: 3, name: '赵网络' }); // 组内第一位成员
  test.equal(ticket.ticketNo, 'TK-0002');

  const types = ticket.events.map((e) => e.type);
  test.deepEqual(types, ['created', 'dispatched', 'assigned']);
  const assignedEvent = ticket.events[2];
  test.deepEqual(assignedEvent.detail.group, { id: netGroupId, name: '网络组' });
  test.deepEqual(assignedEvent.detail.assignee, { id: 3, name: '赵网络' });
  test.equal(assignedEvent.detail.previousAssignee, null);
});

test('创建工单：命中规则但组为空时 assignee 为 null', async (t) => {
  const test = assert;
  const empty = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '空组' },
  });
  const emptyGroupId = empty.body.id;
  await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 4, groupId: emptyGroupId },
  });
  const res = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '账号被锁定', categoryId: 4, priority: 'P3' },
  });
  test.equal(res.status, 201);
  test.equal(res.body.status, 'processing');
  test.deepEqual(res.body.assignedGroup, { id: emptyGroupId, name: '空组' });
  test.equal(res.body.assignee, null);
});

test('dispatch：created → pending_assignment，角色与状态错误（AC-03）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '待分配工单', categoryId: 3, priority: 'P2' },
  });
  const ticketId = created.body.id;

  // 404：工单不存在
  const noTicket = await server.api('POST', '/api/tickets/99999/dispatch', { userId: 1 });
  assertErrorShape(assert, noTicket, 404, 'NOT_FOUND');

  // 403：其他公司用户（非提交人、非该公司管理员/组员）
  const stranger = await server.api('POST', `/api/tickets/${ticketId}/dispatch`, { userId: 7 });
  assertErrorShape(assert, stranger, 403, 'FORBIDDEN');

  // 提交人 dispatch → pending_assignment
  const dispatched = await server.api('POST', `/api/tickets/${ticketId}/dispatch`, { userId: 2 });
  test.equal(dispatched.status, 200);
  test.equal(dispatched.body.status, 'pending_assignment');
  test.equal(dispatched.body.assignedGroup, null);
  const types = dispatched.body.events.map((e) => e.type);
  test.deepEqual(types, ['created', 'dispatched']);

  // 重复 dispatch → 409 INVALID_STATE
  const again = await server.api('POST', `/api/tickets/${ticketId}/dispatch`, { userId: 1 });
  assertErrorShape(assert, again, 409, 'INVALID_STATE');

  // 状态可观察：详情读回 pending_assignment
  const detail = await server.api('GET', `/api/tickets/${ticketId}`, { userId: 2 });
  test.equal(detail.body.status, 'pending_assignment');
});

test('assign：从 pending_assignment 指派，默认处理人（AC-03/AC-05 人工路径）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '人工分配工单', categoryId: 5, priority: 'P4' },
  });
  const ticketId = created.body.id;
  await server.api('POST', `/api/tickets/${ticketId}/dispatch`, { userId: 2 });

  // 403：提交人非该公司业务组成员也非管理员
  const bySubmitter = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 2,
    body: { groupId: netGroupId },
  });
  assertErrorShape(assert, bySubmitter, 403, 'FORBIDDEN');

  // 400：groupId 非整数 / assigneeId 非整数
  const badGroup = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: 'x' },
  });
  assertErrorShape(assert, badGroup, 400, 'VALIDATION_ERROR');
  const badAssignee = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: netGroupId, assigneeId: 1.5 },
  });
  assertErrorShape(assert, badAssignee, 400, 'VALIDATION_ERROR');

  // 400：业务组属于另一公司
  const crossGroup = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: otherCompanyGroupId },
  });
  assertErrorShape(assert, crossGroup, 400, 'VALIDATION_ERROR');

  // 400：assigneeId 不是该组成员
  const notMember = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: netGroupId, assigneeId: 2 },
  });
  assertErrorShape(assert, notMember, 400, 'VALIDATION_ERROR');

  // 400：业务组不存在
  const noGroup = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: 99999 },
  });
  assertErrorShape(assert, noGroup, 400, 'VALIDATION_ERROR');

  // 公司管理员 assign：省略 assigneeId → 组内第一位成员
  const assigned = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: netGroupId },
  });
  test.equal(assigned.status, 200);
  test.equal(assigned.body.status, 'processing');
  test.deepEqual(assigned.body.assignedGroup, { id: netGroupId, name: '网络组' });
  test.deepEqual(assigned.body.assignee, { id: 3, name: '赵网络' });
  const evTypes = assigned.body.events.map((e) => e.type);
  test.deepEqual(evTypes, ['created', 'dispatched', 'assigned']);
  test.deepEqual(assigned.body.events[2].detail.assignee, { id: 3, name: '赵网络' });
  test.equal(assigned.body.events[2].detail.previousAssignee, null);

  // 已 processing 再 assign → 409 INVALID_STATE
  const again = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: netGroupId },
  });
  assertErrorShape(assert, again, 409, 'INVALID_STATE');
});

test('assign：从 created 直达 processing，服务端补 dispatched 事件（契约 3.7）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '直达分配工单', categoryId: 5, priority: 'P2' },
  });
  const ticketId = created.body.id;

  // 公司业务组成员 assign（赵网络是网络组成员）
  const assigned = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 3,
    body: { groupId: netGroupId, assigneeId: 4 },
  });
  test.equal(assigned.status, 200);
  test.equal(assigned.body.status, 'processing');
  test.deepEqual(assigned.body.assignee, { id: 4, name: '钱软件' });
  const evTypes = assigned.body.events.map((e) => e.type);
  test.deepEqual(evTypes, ['created', 'dispatched', 'assigned']);
});

test('GET /api/tickets：筛选、排序与非法参数（契约 3.4）', async (t) => {
  const test = assert;
  // 建立多公司数据：公司 2 用户提交一张
  const byCompany2 = await server.api('POST', '/api/tickets', {
    userId: 6,
    body: { subject: '公司二工单', categoryId: 3, priority: 'P3' },
  });
  test.equal(byCompany2.status, 201);

  const all = await server.api('GET', '/api/tickets', { userId: 1 });
  test.equal(all.status, 200);
  test.ok(all.body.tickets.length >= 5);
  const createdAts = all.body.tickets.map((tk) => tk.createdAt);
  const sorted = [...createdAts].sort().reverse();
  test.deepEqual(createdAts, sorted, '列表按 createdAt 降序');
  for (const tk of all.body.tickets) {
    test.equal(typeof tk.replyCount, 'number');
    test.equal(typeof tk.ticketNo, 'string');
  }

  const byStatus = await server.api('GET', '/api/tickets?status=created', { userId: 1 });
  test.equal(byStatus.status, 200);
  test.ok(byStatus.body.tickets.every((tk) => tk.status === 'created'));

  const byCategory = await server.api('GET', '/api/tickets?categoryId=1', { userId: 1 });
  test.equal(byCategory.status, 200);
  test.ok(byCategory.body.tickets.every((tk) => tk.category.id === 1));

  const byCompany = await server.api('GET', '/api/tickets?companyId=2', { userId: 1 });
  test.equal(byCompany.status, 200);
  test.ok(byCompany.body.tickets.every((tk) => tk.submitter.company.id === 2));

  const bySubmitter = await server.api('GET', '/api/tickets?submitterId=6', { userId: 1 });
  test.equal(bySubmitter.status, 200);
  test.ok(bySubmitter.body.tickets.every((tk) => tk.submitter.id === 6));

  // 组合筛选 AND
  const combined = await server.api('GET', '/api/tickets?status=processing&categoryId=1', { userId: 1 });
  test.equal(combined.status, 200);
  test.ok(combined.body.tickets.every((tk) => tk.status === 'processing' && tk.category.id === 1));

  // 非法 status → 400
  const badStatus = await server.api('GET', '/api/tickets?status=bad', { userId: 1 });
  assertErrorShape(assert, badStatus, 400, 'VALIDATION_ERROR');
  const badCompanyId = await server.api('GET', '/api/tickets?companyId=abc', { userId: 1 });
  assertErrorShape(assert, badCompanyId, 400, 'VALIDATION_ERROR');
});

test('replies：多轮回复按时间升序、角色限制与 replyCount（AC-02）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '回复工单', categoryId: 1, priority: 'P2' },
  });
  const ticketId = created.body.id;
  test.equal(created.body.status, 'processing');
  const assigneeId = created.body.assignee.id; // 赵网络(3)

  // 404
  const noTicket = await server.api('POST', '/api/tickets/99999/replies', {
    userId: 2,
    body: { content: 'x' },
  });
  assertErrorShape(assert, noTicket, 404, 'NOT_FOUND');

  // 403：既非提交人也非当前处理人
  const stranger = await server.api('POST', `/api/tickets/${ticketId}/replies`, {
    userId: 6,
    body: { content: '越权回复' },
  });
  assertErrorShape(assert, stranger, 403, 'FORBIDDEN');

  // 400：content 缺失/空白
  const empty = await server.api('POST', `/api/tickets/${ticketId}/replies`, {
    userId: 2,
    body: { content: ' ' },
  });
  assertErrorShape(assert, empty, 400, 'VALIDATION_ERROR');
  const missing = await server.api('POST', `/api/tickets/${ticketId}/replies`, {
    userId: 2,
    body: {},
  });
  assertErrorShape(assert, missing, 400, 'VALIDATION_ERROR');

  // 提交人与处理人交替多轮回复
  const contents = [
    { userId: 2, content: '提交人第一条：补充位置信息' },
    { userId: assigneeId, content: '处理人回复：已收到，排查中' },
    { userId: 2, content: '提交人第二条：附上截图编号' },
    { userId: assigneeId, content: '处理人回复：定位到交换机故障' },
  ];
  for (const item of contents) {
    const res = await server.api('POST', `/api/tickets/${ticketId}/replies`, {
      userId: item.userId,
      body: { content: item.content },
    });
    test.equal(res.status, 201, `回复应成功：${res.text}`);
    test.equal(res.body.reply.content, item.content);
    test.equal(res.body.reply.author.id, item.userId);
    test.ok(isoPattern.test(res.body.reply.createdAt));
    test.ok(res.body.ticket && typeof res.body.ticket.id === 'number', '回复响应应附带工单详情');
  }

  // 详情读回：升序、每条含回复人与时间
  const detail = await server.api('GET', `/api/tickets/${ticketId}`, { userId: 2 });
  test.equal(detail.body.replies.length, 4);
  test.deepEqual(
    detail.body.replies.map((r) => r.content),
    contents.map((c) => c.content),
  );
  for (const r of detail.body.replies) {
    test.equal(typeof r.id, 'number');
    test.equal(typeof r.author.name, 'string');
    test.ok(isoPattern.test(r.createdAt));
  }
  const times = detail.body.replies.map((r) => r.createdAt);
  test.deepEqual(times, [...times].sort(), '回复按时间升序');

  // 列表形态 replyCount
  const list = await server.api('GET', `/api/tickets?submitterId=2`, { userId: 2 });
  const mine = list.body.tickets.find((tk) => tk.id === ticketId);
  test.equal(mine.replyCount, 4);

  // 回复不产生工单事件
  test.ok(detail.body.events.every((e) => e.type !== 'replied'));
  const evTypesBefore = detail.body.events.length;

  // 任意状态可回复：completed 后提交人仍可回复（契约 3.8）
  await server.api('POST', `/api/tickets/${ticketId}/complete`, { userId: assigneeId });
  const afterComplete = await server.api('POST', `/api/tickets/${ticketId}/replies`, {
    userId: 2,
    body: { content: '完成后追问' },
  });
  test.equal(afterComplete.status, 201);
  const detail2 = await server.api('GET', `/api/tickets/${ticketId}`, { userId: 2 });
  test.equal(detail2.body.replies.length, 5);
  test.equal(detail2.body.replyCount, 5);
  test.equal(detail2.body.events.length, evTypesBefore + 1); // 仅新增 completed 事件
});

test('reassign：保持 processing、事件可追溯与错误码（AC-06）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '转派工单', categoryId: 1, priority: 'P2' },
  });
  const ticketId = created.body.id;
  test.equal(created.body.status, 'processing');
  test.deepEqual(created.body.assignee, { id: 3, name: '赵网络' });

  // 409：非 processing 状态（先取消）
  const other = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '状态不对的工单', categoryId: 3, priority: 'P3' },
  });
  const cancelledRes = await server.api('POST', `/api/tickets/${other.body.id}/cancel`, {
    userId: 2,
    body: { reason: '不需要了' },
  });
  test.equal(cancelledRes.status, 200);
  const badState = await server.api('POST', `/api/tickets/${other.body.id}/reassign`, {
    userId: 1,
    body: { groupId: softGroupId },
  });
  assertErrorShape(assert, badState, 409, 'INVALID_STATE');

  // 403：非当前处理人也非该公司管理员
  const stranger = await server.api('POST', `/api/tickets/${ticketId}/reassign`, {
    userId: 7,
    body: { groupId: softGroupId },
  });
  assertErrorShape(assert, stranger, 403, 'FORBIDDEN');

  // 400：目标组属于另一公司
  const cross = await server.api('POST', `/api/tickets/${ticketId}/reassign`, {
    userId: 3,
    body: { groupId: otherCompanyGroupId },
  });
  assertErrorShape(assert, cross, 400, 'VALIDATION_ERROR');

  // 400：assigneeId 不是目标组成员
  const notMember = await server.api('POST', `/api/tickets/${ticketId}/reassign`, {
    userId: 3,
    body: { groupId: softGroupId, assigneeId: 3 },
  });
  assertErrorShape(assert, notMember, 400, 'VALIDATION_ERROR');

  // 当前处理人转派到软件组（显式指定钱软件）
  const reassigned = await server.api('POST', `/api/tickets/${ticketId}/reassign`, {
    userId: 3,
    body: { groupId: softGroupId, assigneeId: 4 },
  });
  test.equal(reassigned.status, 200);
  test.equal(reassigned.body.status, 'processing', '转派后保持 processing');
  test.deepEqual(reassigned.body.assignedGroup, { id: softGroupId, name: '软件组' });
  test.deepEqual(reassigned.body.assignee, { id: 4, name: '钱软件' });

  const events = reassigned.body.events;
  const reEvent = events.find((e) => e.type === 'reassigned');
  test.ok(reEvent, '应存在 reassigned 事件');
  test.deepEqual(reEvent.actor, { id: 3, name: '赵网络' }, '事件记录转派人');
  test.deepEqual(reEvent.detail.group, { id: softGroupId, name: '软件组' });
  test.deepEqual(reEvent.detail.assignee, { id: 4, name: '钱软件' });
  test.deepEqual(reEvent.detail.previousAssignee, { id: 3, name: '赵网络' });

  // 转派后可继续处理（完成）
  const completed = await server.api('POST', `/api/tickets/${ticketId}/complete`, {
    userId: 4,
  });
  test.equal(completed.status, 200);
});

test('complete：记录 completedBy/completedAt 与事件（AC-08）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '完成工单', categoryId: 1, priority: 'P1' },
  });
  const ticketId = created.body.id;

  // 409：状态非 processing（仍为 processing 时应成功；先用未分配工单验证 409）
  const unassigned = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '未分配完成', categoryId: 3, priority: 'P3' },
  });
  const badState = await server.api('POST', `/api/tickets/${unassigned.body.id}/complete`, {
    userId: 1,
  });
  assertErrorShape(assert, badState, 409, 'INVALID_STATE');

  // 403：非当前处理人也非公司管理员
  const stranger = await server.api('POST', `/api/tickets/${ticketId}/complete`, {
    userId: 7,
  });
  assertErrorShape(assert, stranger, 403, 'FORBIDDEN');

  // 公司管理员完成（带 note）
  const completed = await server.api('POST', `/api/tickets/${ticketId}/complete`, {
    userId: 1,
    body: { note: '根因已修复' },
  });
  test.equal(completed.status, 200);
  test.equal(completed.body.status, 'completed');
  test.deepEqual(completed.body.completedBy, { id: 1, name: '王管理' });
  test.ok(isoPattern.test(completed.body.completedAt), 'completedAt 应为 ISO 时间');
  const completedEvent = completed.body.events.find((e) => e.type === 'completed');
  test.ok(completedEvent);
  test.deepEqual(completedEvent.actor, { id: 1, name: '王管理' });
  test.deepEqual(completedEvent.detail, { note: '根因已修复' });

  // 重复完成 → 409 INVALID_STATE
  const again = await server.api('POST', `/api/tickets/${ticketId}/complete`, {
    userId: 1,
  });
  assertErrorShape(assert, again, 409, 'INVALID_STATE');
});

test('cancel：非终态可取消、终态 409、事件 detail.reason（AC-03）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '取消工单', categoryId: 3, priority: 'P2' },
  });
  const ticketId = created.body.id;

  // 403：其他公司用户
  const stranger = await server.api('POST', `/api/tickets/${ticketId}/cancel`, {
    userId: 6,
    body: { reason: 'x' },
  });
  assertErrorShape(assert, stranger, 403, 'FORBIDDEN');

  // 403：公司管理员（角色仅提交人或当前处理人）
  const admin = await server.api('POST', `/api/tickets/${ticketId}/cancel`, {
    userId: 1,
    body: { reason: 'x' },
  });
  assertErrorShape(assert, admin, 403, 'FORBIDDEN');

  // 提交人取消（带 reason）
  const cancelled = await server.api('POST', `/api/tickets/${ticketId}/cancel`, {
    userId: 2,
    body: { reason: '问题自行恢复' },
  });
  test.equal(cancelled.status, 200);
  test.equal(cancelled.body.status, 'cancelled');
  const cancelEvent = cancelled.body.events.find((e) => e.type === 'cancelled');
  test.ok(cancelEvent);
  test.deepEqual(cancelEvent.actor, { id: 2, name: '李提交' });
  test.deepEqual(cancelEvent.detail, { reason: '问题自行恢复' });

  // 取消后不再进入处理流程：assign → 409
  const assignAfter = await server.api('POST', `/api/tickets/${ticketId}/assign`, {
    userId: 1,
    body: { groupId: netGroupId },
  });
  assertErrorShape(assert, assignAfter, 409, 'INVALID_STATE');

  // 终态再取消 → 409 INVALID_STATE
  const again = await server.api('POST', `/api/tickets/${ticketId}/cancel`, {
    userId: 2,
  });
  assertErrorShape(assert, again, 409, 'INVALID_STATE');

  // 当前处理人可取消 processing 工单（不带 reason → detail.reason 为 null）
  const created2 = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '处理人取消工单', categoryId: 1, priority: 'P2' },
  });
  const cancel2 = await server.api('POST', `/api/tickets/${created2.body.id}/cancel`, {
    userId: 3,
  });
  test.equal(cancel2.status, 200);
  test.equal(cancel2.body.status, 'cancelled');
  const ev2 = cancel2.body.events.find((e) => e.type === 'cancelled');
  test.equal(ev2.detail.reason, null);
});

test('rating：完成后提交人评价、每工单一次（AC-09）', async (t) => {
  const test = assert;
  const created = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '评价工单', categoryId: 1, priority: 'P2' },
  });
  const ticketId = created.body.id;

  // 409：未完成即评价
  const notCompleted = await server.api('POST', `/api/tickets/${ticketId}/rating`, {
    userId: 2,
    body: { score: 5 },
  });
  assertErrorShape(assert, notCompleted, 409, 'INVALID_STATE');

  await server.api('POST', `/api/tickets/${ticketId}/complete`, { userId: 3 });

  // 403：非提交人
  const stranger = await server.api('POST', `/api/tickets/${ticketId}/rating`, {
    userId: 3,
    body: { score: 5 },
  });
  assertErrorShape(assert, stranger, 403, 'FORBIDDEN');

  // 400：score 越界/非整数
  for (const score of [0, 6, 3.5, '5']) {
    const bad = await server.api('POST', `/api/tickets/${ticketId}/rating`, {
      userId: 2,
      body: { score },
    });
    assertErrorShape(assert, bad, 400, 'VALIDATION_ERROR');
  }

  // 提交人评价
  const rated = await server.api('POST', `/api/tickets/${ticketId}/rating`, {
    userId: 2,
    body: { score: 4, comment: '响应及时' },
  });
  test.equal(rated.status, 201);
  test.equal(rated.body.rating.score, 4);
  test.equal(rated.body.rating.comment, '响应及时');
  test.ok(isoPattern.test(rated.body.rating.createdAt));

  // 详情读回评价与 rated 事件
  const detail = await server.api('GET', `/api/tickets/${ticketId}`, { userId: 2 });
  test.equal(detail.body.rating.score, 4);
  test.equal(detail.body.rating.comment, '响应及时');
  const ratedEvent = detail.body.events.find((e) => e.type === 'rated');
  test.ok(ratedEvent);
  test.deepEqual(ratedEvent.actor, { id: 2, name: '李提交' });

  // 重复评价 → 409 CONFLICT
  const again = await server.api('POST', `/api/tickets/${ticketId}/rating`, {
    userId: 2,
    body: { score: 3 },
  });
  assertErrorShape(assert, again, 409, 'CONFLICT');

  // comment 省略时为 null
  const created2 = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '评价工单二', categoryId: 2, priority: 'P3' },
  });
  await server.api('POST', `/api/tickets/${created2.body.id}/complete`, { userId: 4 });
  const rated2 = await server.api('POST', `/api/tickets/${created2.body.id}/rating`, {
    userId: 2,
    body: { score: 5 },
  });
  test.equal(rated2.status, 201);
  test.equal(rated2.body.rating.comment, null);
});

test('工单路径资源与详情 404', async (t) => {
  const test = assert;
  const detail = await server.api('GET', '/api/tickets/99999', { userId: 1 });
  assertErrorShape(assert, detail, 404, 'NOT_FOUND');
  const badParam = await server.api('GET', '/api/tickets/abc', { userId: 1 });
  assertErrorShape(assert, badParam, 404, 'NOT_FOUND');
  const badUserParam = await server.api('GET', '/api/users/xyz/tickets', { userId: 1 });
  assertErrorShape(assert, badUserParam, 404, 'NOT_FOUND');
});

test('非 JSON 请求体 → 400 VALIDATION_ERROR', async (t) => {
  const test = assert;
  const res = await fetch(`${server.baseUrl}/api/tickets`, {
    method: 'POST',
    headers: { 'X-User-Id': '2', 'content-type': 'application/json' },
    body: 'not-json',
  });
  test.equal(res.status, 400);
  const body = await res.json();
  test.equal(body.error.code, 'VALIDATION_ERROR');
});

