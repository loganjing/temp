import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, assertErrorShape } from './helpers.js';

/**
 * 组织配置 API 验收测试（契约第 2 节 + 3.5 历史工单 + X-User-Id 校验）：
 * users / business-groups / members / assignment-rules / categories。
 *
 * 种子数据（migrations/sqlite/0002_seed.sql）：
 * - 公司 1 星云科技：1 王管理(管理员)、2 李提交(提交人)、3 赵网络(处理人)、4 钱软件(处理人)
 * - 公司 2 远航制造：5 孙管理(管理员)、6 周提交(提交人)、7 吴处理(处理人)
 * - 分类：1 网络问题、2 软件问题、3 硬件问题、4 账号权限、5 其他
 */

let server;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test('GET /api/users 返回全部种子用户与完整字段', async () => {
  const res = await server.api('GET', '/api/users', { userId: 1 });
  assert.equal(res.status, 200);
  const users = res.body.users;
  assert.equal(users.length, 7);
  const u1 = users.find((u) => u.id === 1);
  assert.deepEqual(Object.keys(u1).sort(), ['company', 'department', 'email', 'id', 'isCompanyAdmin', 'name'].map((k) => k).sort());
  assert.equal(u1.name, '王管理');
  assert.equal(u1.email, 'admin.wang@nebula.example');
  assert.deepEqual(u1.company, { id: 1, name: '星云科技' });
  assert.equal(u1.department, '运营部');
  assert.equal(u1.isCompanyAdmin, true);
  const u2 = users.find((u) => u.id === 2);
  assert.equal(u2.isCompanyAdmin, false);
  assert.deepEqual(u2.company, { id: 1, name: '星云科技' });
});

test('X-User-Id 校验：缺失/非整数/不存在用户均 401 INVALID_USER', async () => {
  const missing = await fetch(`${server.baseUrl}/api/users`, { method: 'GET' });
  assert.equal(missing.status, 401);
  const missingBody = await missing.json();
  assert.equal(missingBody.error.code, 'INVALID_USER');

  const notInt = await server.api('GET', '/api/users', { userId: 'abc' });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, notInt, 401, 'INVALID_USER');

  const empty = await server.api('GET', '/api/users', { userId: ' ' });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, empty, 401, 'INVALID_USER');

  const notExist = await server.api('GET', '/api/users', { userId: 99999 });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, notExist, 401, 'INVALID_USER');

  const valid = await server.api('GET', '/api/users', { userId: 1 });
  assert.equal(valid.status, 200);
});

test('业务组：管理员新增、读回列表与成员（AC-04 契约形态）', async () => {
  // 公司不存在 → 404
  const noCompany = await server.api('POST', '/api/companies/999/business-groups', {
    userId: 1,
    body: { name: '幽灵组' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, noCompany, 404, 'NOT_FOUND');

  // 非该公司管理员 → 403
  const wrongAdmin = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 5,
    body: { name: '越权组' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, wrongAdmin, 403, 'FORBIDDEN');

  // 普通用户 → 403
  const notAdmin = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 2,
    body: { name: '越权组2' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, notAdmin, 403, 'FORBIDDEN');

  // name 缺失 / 空 → 400
  const noName = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: {},
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, noName, 400, 'VALIDATION_ERROR');
  const emptyName = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '  ' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, emptyName, 400, 'VALIDATION_ERROR');

  // 创建网络组与软件组
  const net = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '网络组' },
  });
  assert.equal(net.status, 201);
  assert.equal(net.body.companyId, 1);
  assert.equal(net.body.name, '网络组');
  assert.deepEqual(net.body.members, []);
  const netGroupId = net.body.id;

  const soft = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '软件组' },
  });
  assert.equal(soft.status, 201);
  const softGroupId = soft.body.id;

  // 同名重复 → 409 CONFLICT
  const dup = await server.api('POST', '/api/companies/1/business-groups', {
    userId: 1,
    body: { name: '网络组' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, dup, 409, 'CONFLICT');

  // 设置成员：userIds 非数组 → 400
  const badList = await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 1,
    body: { userIds: 'x' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, badList, 400, 'VALIDATION_ERROR');

  // 成员不存在 → 400
  const unknownUser = await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 1,
    body: { userIds: [99999] },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, unknownUser, 400, 'VALIDATION_ERROR');

  // 成员属于另一公司 → 400
  const crossCompany = await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 1,
    body: { userIds: [6] },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, crossCompany, 400, 'VALIDATION_ERROR');

  // 非该公司管理员设置成员 → 403
  const notOwner = await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 5,
    body: { userIds: [3] },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, notOwner, 403, 'FORBIDDEN');

  // 组不存在 → 404
  const noGroup = await server.api('PUT', '/api/business-groups/99999/members', {
    userId: 1,
    body: { userIds: [3] },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, noGroup, 404, 'NOT_FOUND');

  // 正常覆盖设置（重复元素视为一次）
  const setMembers = await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 1,
    body: { userIds: [3, 3, 4] },
  });
  assert.equal(setMembers.status, 200);
  assert.equal(setMembers.body.members.length, 2);
  assert.deepEqual(
    setMembers.body.members.map((m) => m.id).sort(),
    [3, 4],
  );
  const memberUser = setMembers.body.members[0];
  assert.equal(memberUser.company.id, 1);
  assert.equal(typeof memberUser.email, 'string');
  assert.equal(typeof memberUser.department, 'string');
  assert.equal(typeof memberUser.isCompanyAdmin, 'boolean');

  const setSoftMembers = await server.api('PUT', `/api/business-groups/${softGroupId}/members`, {
    userId: 1,
    body: { userIds: [4] },
  });
  assert.equal(setSoftMembers.status, 200);
  assert.equal(setSoftMembers.body.members.length, 1);

  // 幂等：同一集合重复提交结果一致
  const again = await server.api('PUT', `/api/business-groups/${netGroupId}/members`, {
    userId: 1,
    body: { userIds: [3, 4] },
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.members.length, 2);

  // 列表读回（任意有效用户）
  const list = await server.api('GET', '/api/companies/1/business-groups', { userId: 2 });
  assert.equal(list.status, 200);
  const groupNames = list.body.groups.map((g) => g.name);
  assert.deepEqual(groupNames.sort(), ['网络组', '软件组']);
  for (const g of list.body.groups) {
    assert.ok(Array.isArray(g.members));
  }

  // 公司不存在 → 404
  const list404 = await server.api('GET', '/api/companies/999/business-groups', { userId: 1 });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, list404, 404, 'NOT_FOUND');
});

test('分配规则：配置、读回与错误码', async () => {
  const groups = await server.api('GET', '/api/companies/1/business-groups', { userId: 1 });
  const netGroup = groups.body.groups.find((g) => g.name === '网络组');
  const softGroup = groups.body.groups.find((g) => g.name === '软件组');

  // 公司不存在 → 404
  const noCompany = await server.api('POST', '/api/companies/999/assignment-rules', {
    userId: 1,
    body: { categoryId: 1, groupId: netGroup.id },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, noCompany, 404, 'NOT_FOUND');

  // 非该公司管理员 → 403
  const notAdmin = await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 2,
    body: { categoryId: 1, groupId: netGroup.id },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, notAdmin, 403, 'FORBIDDEN');

  // categoryId 不存在 → 400
  const badCategory = await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 999, groupId: netGroup.id },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, badCategory, 400, 'VALIDATION_ERROR');

  // 业务组属于另一公司 → 400
  const otherCompanyGroup = await server.api('POST', '/api/companies/2/business-groups', {
    userId: 5,
    body: { name: '远航运维组' },
  });
  assert.equal(otherCompanyGroup.status, 201);
  const wrongGroup = await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 1, groupId: otherCompanyGroup.body.id },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, wrongGroup, 400, 'VALIDATION_ERROR');

  // 正常创建：网络问题(1) → 网络组
  const rule = await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 1, groupId: netGroup.id },
  });
  assert.equal(rule.status, 201);
  assert.deepEqual(rule.body.category, { id: 1, name: '网络问题' });
  assert.deepEqual(rule.body.group, { id: netGroup.id, name: '网络组' });
  assert.equal(typeof rule.body.id, 'number');

  // 重复规则 → 409 CONFLICT
  const dup = await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 1, groupId: softGroup.id },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, dup, 409, 'CONFLICT');

  // 不同分类可指向同一组
  const rule2 = await server.api('POST', '/api/companies/1/assignment-rules', {
    userId: 1,
    body: { categoryId: 2, groupId: softGroup.id },
  });
  assert.equal(rule2.status, 201);

  // 读回（任意有效用户）
  const list = await server.api('GET', '/api/companies/1/assignment-rules', { userId: 3 });
  assert.equal(list.status, 200);
  assert.equal(list.body.rules.length, 2);

  // 公司不存在 → 404
  const list404 = await server.api('GET', '/api/companies/999/assignment-rules', { userId: 1 });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, list404, 404, 'NOT_FOUND');
});

test('分类：列表读回、管理员新增、重复与错误码', async () => {
  const list = await server.api('GET', '/api/categories', { userId: 2 });
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.categories.map((c) => c.name),
    ['网络问题', '软件问题', '硬件问题', '账号权限', '其他'],
  );
  for (const c of list.body.categories) {
    assert.equal(typeof c.id, 'number');
  }

  // 非管理员 → 403
  const notAdmin = await server.api('POST', '/api/categories', {
    userId: 2,
    body: { name: '权限问题' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, notAdmin, 403, 'FORBIDDEN');

  // name 缺失 → 400
  const noName = await server.api('POST', '/api/categories', { userId: 5, body: {} });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, noName, 400, 'VALIDATION_ERROR');

  // 管理员（不限公司）新增
  const created = await server.api('POST', '/api/categories', {
    userId: 5,
    body: { name: '权限问题' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, '权限问题');

  // 同名 → 409 CONFLICT
  const dup = await server.api('POST', '/api/categories', {
    userId: 1,
    body: { name: '权限问题' },
  });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, dup, 409, 'CONFLICT');
});

test('GET /api/users/{userId}/tickets：历史工单与 404', async () => {
  // 用户不存在 → 404
  const noUser = await server.api('GET', '/api/users/99999/tickets', { userId: 1 });
  assertErrorShape({ equal: assert.equal, ok: assert.ok }, noUser, 404, 'NOT_FOUND');

  // 无工单时返回空列表
  const empty = await server.api('GET', '/api/users/2/tickets', { userId: 1 });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.tickets, []);

  // 创建两张工单后按 createdAt 降序读回
  const t1 = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '历史工单一', description: 'a', categoryId: 3, priority: 'P1' },
  });
  assert.equal(t1.status, 201);
  await delay(5);
  const t2 = await server.api('POST', '/api/tickets', {
    userId: 2,
    body: { subject: '历史工单二', description: 'b', categoryId: 4, priority: 'P3' },
  });
  assert.equal(t2.status, 201);

  const history = await server.api('GET', '/api/users/2/tickets', { userId: 3 });
  assert.equal(history.status, 200);
  assert.equal(history.body.tickets.length, 2);
  assert.equal(history.body.tickets[0].id, t2.body.id);
  assert.equal(history.body.tickets[1].id, t1.body.id);
  for (const t of history.body.tickets) {
    assert.equal(t.submitter.id, 2);
    assert.equal(typeof t.replyCount, 'number');
  }
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
