/**
 * API 冒烟测试（使用隔离测试数据库）。
 *
 * 运行方式：
 *   rm -f data/test-visitors.db && DB_PATH=data/test-visitors.db tsx scripts/smoke-test.ts
 *
 * 测试流程：提交登记 → 查询列表 → 查询详情 → 审批 → 状态校验 → 微信解密 → 字段校验 → 404
 */
import { rmSync } from 'node:fs';

// 在导入 app 之前设置隔离测试环境
process.env.DB_PATH = 'data/test-visitors.db';
process.env.PORT = '3999';

// 清理旧测试数据库
rmSync('data/test-visitors.db', { force: true });
rmSync('data/test-visitors.db-shm', { force: true });
rmSync('data/test-visitors.db-wal', { force: true });

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  \u2713 ${message}`);
    passed++;
  } else {
    console.error(`  \u2717 ${message}`);
    failed++;
  }
}

async function main(): Promise<void> {
  const { getApp } = await import('../src/app');
  const app = getApp();

  // --- Test 1: POST /api/visitors — 提交访客登记 ---
  console.log('\nTest 1: POST /api/visitors — 提交访客登记');
  const createResp = await app.request('/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '张三',
      phone: '13800138000',
      id_card: '110101199001011234',
      company: '测试科技有限公司',
      visit_reason: '商务洽谈与合作交流',
      host_name: '李四',
      expected_arrival_time: '2026-11-06T10:00:00Z',
      phone_source: 'manual',
    }),
  });
  assert(createResp.status === 201, '应返回 201 Created');
  const visitor = (await createResp.json()) as Record<string, unknown>;
  assert(visitor.status === 'pending', '状态应为 pending');
  assert(typeof visitor.id === 'string' && (visitor.id as string).length > 0, '应返回 ULID ID');
  assert(visitor.name === '张三', '姓名应匹配');
  assert(visitor.host_name === '李四', '被访人应匹配');

  const visitorId = visitor.id as string;

  // --- Test 2: GET /api/visitors — 查询登记列表 ---
  console.log('\nTest 2: GET /api/visitors — 查询登记列表');
  const listResp = await app.request('/api/visitors');
  assert(listResp.status === 200, '应返回 200 OK');
  const list = (await listResp.json()) as { data: unknown[]; total: number };
  assert(list.total >= 1, '总数应 >= 1');
  assert(
    list.data.some((v) => (v as { id: string }).id === visitorId),
    '列表应包含已创建的记录',
  );

  // --- Test 2b: GET /api/visitors?status=pending — 按状态过滤 ---
  console.log('\nTest 2b: GET /api/visitors?status=pending — 按状态过滤');
  const pendingResp = await app.request('/api/visitors?status=pending');
  assert(pendingResp.status === 200, '应返回 200 OK');
  const pendingList = (await pendingResp.json()) as { data: { status: string }[]; total: number };
  assert(
    pendingList.data.every((v) => v.status === 'pending'),
    '所有记录状态应为 pending',
  );

  // --- Test 2c: GET /api/visitors?phone=13800138000 — 按手机号过滤 ---
  console.log('\nTest 2c: GET /api/visitors?phone=13800138000 — 按手机号过滤');
  const phoneResp = await app.request('/api/visitors?phone=13800138000');
  assert(phoneResp.status === 200, '应返回 200 OK');
  const phoneList = (await phoneResp.json()) as { data: { phone: string }[]; total: number };
  assert(
    phoneList.data.every((v) => v.phone === '13800138000'),
    '所有记录手机号应匹配',
  );

  // --- Test 3: GET /api/visitors/:id — 获取登记详情 ---
  console.log('\nTest 3: GET /api/visitors/:id — 获取登记详情');
  const detailResp = await app.request(`/api/visitors/${visitorId}`);
  assert(detailResp.status === 200, '应返回 200 OK');
  const detail = (await detailResp.json()) as Record<string, unknown>;
  assert(detail.id === visitorId, 'ID 应匹配');
  assert(detail.name === '张三', '姓名应匹配');
  assert(detail.id_card === '110101199001011234', '身份证号应匹配');

  // --- Test 4: PATCH /api/visitors/:id/status — 审批通过 ---
  console.log('\nTest 4: PATCH /api/visitors/:id/status — 审批通过');
  const approveResp = await app.request(`/api/visitors/${visitorId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert(approveResp.status === 200, '应返回 200 OK');
  const approved = (await approveResp.json()) as Record<string, unknown>;
  assert(approved.status === 'approved', '状态应更新为 approved');
  assert(approved.updated_at !== visitor.updated_at, 'updated_at 应已更新');

  // --- Test 5: PATCH /api/visitors/:id/status — 终态不可变更（返回 409） ---
  console.log('\nTest 5: PATCH /api/visitors/:id/status — 终态不可变更（返回 409）');
  const reApproveResp = await app.request(`/api/visitors/${visitorId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' }),
  });
  assert(reApproveResp.status === 409, '应返回 409 Conflict');
  const reApproveBody = (await reApproveResp.json()) as { error: { code: string } };
  assert(
    reApproveBody.error.code === 'INVALID_STATE_TRANSITION',
    '错误码应为 INVALID_STATE_TRANSITION',
  );

  // --- Test 6: POST /api/wechat/phone — 无微信环境返回合理错误 ---
  console.log('\nTest 6: POST /api/wechat/phone — 无微信环境返回合理错误');
  const wechatResp = await app.request('/api/wechat/phone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-code' }),
  });
  assert(wechatResp.status === 500, '应返回 500');
  const wechatBody = (await wechatResp.json()) as { error: { code: string } };
  assert(
    wechatBody.error.code === 'WECHAT_SERVICE_ERROR',
    '错误码应为 WECHAT_SERVICE_ERROR',
  );

  // --- Test 7: POST /api/visitors — 字段校验失败 ---
  console.log('\nTest 7: POST /api/visitors — 字段校验失败');
  const invalidResp = await app.request('/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '',
      phone: '123',
      id_card: '123',
      company: '',
      visit_reason: '',
      phone_source: 'invalid',
    }),
  });
  assert(invalidResp.status === 400, '应返回 400 Bad Request');
  const invalidBody = (await invalidResp.json()) as {
    error: { code: string; fields: Record<string, string> };
  };
  assert(invalidBody.error.code === 'VALIDATION_ERROR', '错误码应为 VALIDATION_ERROR');
  assert(
    invalidBody.error.fields && Object.keys(invalidBody.error.fields).length > 0,
    '应包含字段级错误',
  );

  // --- Test 8: GET /api/visitors/:id — 不存在的记录返回 404 ---
  console.log('\nTest 8: GET /api/visitors/:id — 不存在的记录返回 404');
  const notFoundResp = await app.request('/api/visitors/01NONEXISTENTID000');
  assert(notFoundResp.status === 404, '应返回 404 Not Found');
  const notFoundBody = (await notFoundResp.json()) as { error: { code: string } };
  assert(notFoundBody.error.code === 'NOT_FOUND', '错误码应为 NOT_FOUND');

  // --- Test 9: POST /api/visitors — 仅必填字段（不含选填字段） ---
  console.log('\nTest 9: POST /api/visitors — 仅必填字段');
  const minResp = await app.request('/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '王五',
      phone: '13900139000',
      id_card: '110101199002022345',
      company: '另一家公司',
      visit_reason: '技术交流',
      phone_source: 'wechat',
    }),
  });
  assert(minResp.status === 201, '应返回 201 Created');
  const minVisitor = (await minResp.json()) as Record<string, unknown>;
  assert(minVisitor.host_name === null, 'host_name 应为 null');
  assert(minVisitor.expected_arrival_time === null, 'expected_arrival_time 应为 null');
  assert(minVisitor.phone_source === 'wechat', 'phone_source 应为 wechat');

  // --- Test 10: PATCH with invalid status value ---
  console.log('\nTest 10: PATCH with invalid status value — 返回 400');
  const minId = minVisitor.id as string;
  const badStatusResp = await app.request(`/api/visitors/${minId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'invalid' }),
  });
  assert(badStatusResp.status === 400, '应返回 400 Bad Request');
  const badStatusBody = (await badStatusResp.json()) as { error: { code: string } };
  assert(badStatusBody.error.code === 'VALIDATION_ERROR', '错误码应为 VALIDATION_ERROR');

  // --- Summary ---
  console.log(`\n========================================`);
  console.log(`冒烟测试结果: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('冒烟测试执行失败:', err);
  process.exit(1);
});
