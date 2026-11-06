/**
 * 访客系统端到端 API 测试
 * 验证 AC-01（登记持久化）和 AC-02（状态查看与更新）的后端行为
 *
 * 测试流程：
 * 1. 访客登记 → 验证持久化和 pending 状态（AC-01）
 * 2. 按手机号查询 → 验证可读回且状态为待审核（AC-01/AC-02）
 * 3. 审批通过 → 验证状态更新为 approved（AC-02）
 * 4. 再次查询 → 验证状态已更新为通过（AC-02）
 * 5. 第二位访客登记 → 拒绝 → 验证状态为 rejected（AC-02）
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';

let pass = 0;
let fail = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.error(`  ✗ ${label} ${detail}`);
    fail++;
  }
}

async function main() {
  console.log('=== 访客系统端到端 API 测试 ===\n');

  // --- AC-01: 访客登记持久化 ---
  console.log('[AC-01] 访客登记与持久化');

  // 1. 提交登记
  console.log('  步骤1: 提交访客登记');
  const regBody = {
    name: '王五',
    phone: '13700137000',
    id_card: '110101199003071234',
    company: '端到端测试公司',
    visit_reason: '项目对接会议',
    host_name: '赵总',
    expected_arrival_time: '2026-11-06T15:00:00Z',
    phone_source: 'manual'
  };
  const regRes = await fetch(`${BASE}/api/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regBody)
  });
  assert('POST /api/visitors 返回 201', regRes.status === 201, `(实际: ${regRes.status})`);

  const regData = await regRes.json();
  assert('返回记录 ID (ULID)', typeof regData.id === 'string' && regData.id.length > 0);
  assert('name 持久化正确', regData.name === '王五');
  assert('phone 持久化正确', regData.phone === '13700137000');
  assert('id_card 持久化正确', regData.id_card === '110101199003071234');
  assert('company 持久化正确', regData.company === '端到端测试公司');
  assert('visit_reason 持久化正确', regData.visit_reason === '项目对接会议');
  assert('host_name 持久化正确', regData.host_name === '赵总');
  assert('phone_source 持久化正确', regData.phone_source === 'manual');
  assert('status 为 pending（待审核）', regData.status === 'pending');
  assert('created_at 已生成', typeof regData.created_at === 'string');
  assert('updated_at 已生成', typeof regData.updated_at === 'string');

  const visitorId = regData.id;
  const visitorPhone = regData.phone;
  console.log(`  → 访客 ID: ${visitorId}\n`);

  // 2. 按手机号查询（模拟小程序「我的登记」页行为）
  console.log('  步骤2: 按手机号查询登记记录（模拟小程序我的登记页）');
  const queryRes = await fetch(`${BASE}/api/visitors?phone=${visitorPhone}`);
  assert('GET /api/visitors?phone= 返回 200', queryRes.status === 200);

  const queryData = await queryRes.json();
  assert('返回 data 数组', Array.isArray(queryData.data));
  const found = queryData.data.find(v => v.id === visitorId);
  assert('查询结果包含刚提交的记录', !!found);
  assert('查询记录 status 为 pending', found && found.status === 'pending');
  assert('查询记录包含所有必填字段', found && found.name && found.phone && found.id_card && found.company && found.visit_reason);

  // --- AC-02: 状态查看与更新 ---
  console.log('\n[AC-02] 状态查看与审核结果更新');

  // 3. 审批通过
  console.log('  步骤3: 审批人执行「通过」操作');
  const approveRes = await fetch(`${BASE}/api/visitors/${visitorId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' })
  });
  assert('PATCH /api/visitors/{id}/status 返回 200', approveRes.status === 200);

  const approveData = await approveRes.json();
  assert('审批后 status 变为 approved', approveData.status === 'approved');
  assert('updated_at 已更新', approveData.updated_at !== regData.updated_at);

  // 4. 再次按手机号查询，验证状态已更新（模拟访客刷新查看）
  console.log('  步骤4: 访客再次查询，验证状态已更新为「通过」');
  const query2Res = await fetch(`${BASE}/api/visitors?phone=${visitorPhone}`);
  const query2Data = await query2Res.json();
  const found2 = query2Data.data.find(v => v.id === visitorId);
  assert('再次查询找到该记录', !!found2);
  assert('状态已更新为 approved', found2 && found2.status === 'approved');

  // 5. 第二位访客：登记 → 拒绝
  console.log('\n[AC-02 补充] 第二位访客登记→拒绝流程');

  console.log('  步骤5a: 第二位访客登记');
  const reg2Res = await fetch(`${BASE}/api/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '赵六',
      phone: '13600136000',
      id_card: '110101198806052345',
      company: '另一家测试公司',
      visit_reason: '设备巡检',
      phone_source: 'manual'
    })
  });
  assert('第二位访客登记返回 201', reg2Res.status === 201);
  const reg2Data = await reg2Res.json();
  assert('第二位访客 status 为 pending', reg2Data.status === 'pending');

  console.log('  步骤5b: 审批人执行「拒绝」操作');
  const rejectRes = await fetch(`${BASE}/api/visitors/${reg2Data.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' })
  });
  assert('拒绝操作返回 200', rejectRes.status === 200);
  const rejectData = await rejectRes.json();
  assert('审批后 status 变为 rejected', rejectData.status === 'rejected');

  console.log('  步骤5c: 访客查询，验证状态为「拒绝」');
  const query3Res = await fetch(`${BASE}/api/visitors?phone=13600136000`);
  const query3Data = await query3Res.json();
  const found3 = query3Data.data.find(v => v.id === reg2Data.id);
  assert('查询到第二位访客记录', !!found3);
  assert('状态为 rejected', found3 && found3.status === 'rejected');

  // --- 边界校验 ---
  console.log('\n[边界校验]');

  // 终态不可变更
  console.log('  步骤6: 验证终态不可变更');
  const reApproveRes = await fetch(`${BASE}/api/visitors/${visitorId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' })
  });
  assert('已通过记录再次审批返回 409', reApproveRes.status === 409, `(实际: ${reApproveRes.status})`);

  // 不存在的记录
  console.log('  步骤7: 验证不存在的记录返回 404');
  const notFoundRes = await fetch(`${BASE}/api/visitors/01NONEXISTENTID000000/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' })
  });
  assert('不存在的记录返回 404', notFoundRes.status === 404, `(实际: ${notFoundRes.status})`);

  // 字段校验
  console.log('  步骤8: 验证字段校验');
  const invalidRes = await fetch(`${BASE}/api/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '',
      phone: '123',
      id_card: 'abc',
      company: '',
      visit_reason: '',
      phone_source: 'invalid'
    })
  });
  assert('校验失败返回 400', invalidRes.status === 400, `(实际: ${invalidRes.status})`);

  // --- 结果汇总 ---
  console.log(`\n=== 测试结果: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
