-- 幂等种子数据：公司、各角色用户（统一密码 Passw0rd!，凭证为 authkit scrypt 哈希）、
-- 业务组/成员/分类规则示例、已知分布的工单样本（供统计验收）。
-- 全部使用 INSERT OR IGNORE 保证重复执行不重复插入。

-- 公司 -----------------------------------------------------------------
INSERT OR IGNORE INTO companies (id, name, created_at) VALUES
  ('c-a', '公司A', '2026-09-01T00:00:00.000Z'),
  ('c-b', '公司B', '2026-09-01T00:00:00.000Z');

-- 用户（userkit users 表）与角色/部门扩展（user_profiles，同一迁移内写入） ----
INSERT OR IGNORE INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES
  ('u-a-admin',    '管理员A',     'admin.a@example.com',     NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-h1',       '处理人甲',    'handler.a1@example.com',  NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-h2',       '处理人乙',    'handler.a2@example.com',  NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-s1',       '研发提交人一', 'submitter.a1@example.com', NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-s2',       '市场提交人二', 'submitter.a2@example.com', NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-s3',       '研发提交人三', 'submitter.a3@example.com', NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-s4',       '提交人四',    'submitter.a4@example.com', NULL, 1, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-a-disabled', '停用提交人',  'disabled.a@example.com',  NULL, 0, 'c-a', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-b-admin',    '管理员B',     'admin.b@example.com',     NULL, 1, 'c-b', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-b-h1',       '处理人丙',    'handler.b1@example.com',  NULL, 1, 'c-b', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('u-b-s1',       '运营提交人一', 'submitter.b1@example.com', NULL, 1, 'c-b', '51c44efb5d5c7748c66e782759f5e5bb:4c187dc654c4f99ade5377c1e3fd35ca7ecf0ae70eb9f5d0e87ecd47fd3408fbdc2edd5db9243d58b8f5165e58f5ed7dd821ebf06929d3c3df266bb4c65f1b99', 0, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');

INSERT OR IGNORE INTO user_profiles (user_id, department, role) VALUES
  ('u-a-admin',    '运维部', 'admin'),
  ('u-a-h1',       '技术部', 'handler'),
  ('u-a-h2',       '技术部', 'handler'),
  ('u-a-s1',       '研发部', 'submitter'),
  ('u-a-s2',       '市场部', 'submitter'),
  ('u-a-s3',       '研发部', 'submitter'),
  ('u-a-s4',       NULL,     'submitter'),
  ('u-a-disabled', '测试部', 'submitter'),
  ('u-b-admin',    NULL,     'admin'),
  ('u-b-h1',       '客服部', 'handler'),
  ('u-b-s1',       '运营部', 'submitter');

-- 业务组与成员 -----------------------------------------------------------
INSERT OR IGNORE INTO groups (id, company_id, name, created_at) VALUES
  ('g-a1', 'c-a', '技术支持组', '2026-09-02T00:00:00.000Z'),
  ('g-a2', 'c-a', '售后服务组', '2026-09-02T00:00:00.000Z'),
  ('g-b1', 'c-b', '客服组',     '2026-09-02T00:00:00.000Z');

INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES
  ('g-a1', 'u-a-h1'),
  ('g-a1', 'u-a-h2'),
  ('g-a2', 'u-a-h2'),
  ('g-b1', 'u-b-h1');

-- 分类分配规则（公司内分类 → 业务组） ------------------------------------
INSERT OR IGNORE INTO category_rules (id, company_id, category, group_id) VALUES
  ('cr-a1', 'c-a', '登录问题', 'g-a1'),
  ('cr-a2', 'c-a', '账单问题', 'g-a2'),
  ('cr-b1', 'c-b', '网络问题', 'g-b1');

-- 工单样本（已知分布，供统计验收） --------------------------------------
-- 分布核对：公司A=8（TK-000001..TK-000008）、公司B=2（TK-000009/TK-000010）。
-- 部门：研发部 5（1,2,3,4,5）、市场部 2（6,7）、null 1（8）、运营部 2（9,10）。
-- 状态：COMPLETED 4（1,2,6,9）、PROCESSING 1（3）、PENDING_ASSIGNMENT 3（4,7,10）、CANCELLED 2（5,8）。
-- 分类：登录问题 4（1,2,5,8）、账单问题 2（3,6）、数据问题 2（4,7）、网络问题 1（9）、其他问题 1（10）。
-- 首次回复间隔（分钟）：TK1=30、TK2=60、TK3=90、TK6=120、TK9=30 → 平均 66.0。
-- 评分：TK1=5、TK2=4、TK6=3、TK9=2 → 平均 3.5，评价数 4。

INSERT OR IGNORE INTO tickets (id, company_id, title, description, category, priority, status, submitter_id, assigned_group_id, assignee_id, completed_by, completed_at, first_reply_at, created_at, updated_at) VALUES
  ('TK-000001', 'c-a', '无法登录企业邮箱', '打开登录页输入密码后一直提示凭证无效，多次重试无果。', '登录问题', 'P1', 'COMPLETED', 'u-a-s1', 'g-a1', 'u-a-h1', 'u-a-h1', '2026-10-01T10:30:00.000Z', '2026-10-01T09:30:00.000Z', '2026-10-01T09:00:00.000Z', '2026-10-01T10:30:00.000Z'),
  ('TK-000002', 'c-a', '登录验证码收不到', '登录页发送验证码后邮箱一直没有收到，换邮箱也不行。', '登录问题', 'P2', 'COMPLETED', 'u-a-s1', 'g-a1', 'u-a-h1', 'u-a-h1', '2026-10-02T11:00:00.000Z', '2026-10-02T10:00:00.000Z', '2026-10-02T09:00:00.000Z', '2026-10-02T11:00:00.000Z'),
  ('TK-000003', 'c-a', '上月账单金额与合同不符', '上月账单比合同约定多出一笔服务费，请核实并说明。', '账单问题', 'P0', 'PROCESSING', 'u-a-s3', 'g-a2', 'u-a-h2', NULL, NULL, '2026-10-03T09:30:00.000Z', '2026-10-03T08:00:00.000Z', '2026-10-03T09:30:00.000Z'),
  ('TK-000004', 'c-a', '报表导出数据缺失', '导出的月度报表缺少最后三天的数据，重新导出仍然缺失。', '数据问题', 'P3', 'PENDING_ASSIGNMENT', 'u-a-s1', NULL, NULL, NULL, NULL, NULL, '2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00.000Z'),
  ('TK-000005', 'c-a', '新员工账号无法激活', '新入职同事的账号激活邮件链接失效，无法完成激活。', '登录问题', 'P2', 'CANCELLED', 'u-a-s3', 'g-a1', NULL, NULL, NULL, NULL, '2026-10-03T11:00:00.000Z', '2026-10-03T12:00:00.000Z'),
  ('TK-000006', 'c-a', '发票抬头需要修改', '开票信息中公司名称有误，需要更正后重新开具上月发票。', '账单问题', 'P1', 'COMPLETED', 'u-a-s2', 'g-a2', 'u-a-h2', 'u-a-h2', '2026-10-01T17:00:00.000Z', '2026-10-01T16:00:00.000Z', '2026-10-01T14:00:00.000Z', '2026-10-01T17:00:00.000Z'),
  ('TK-000007', 'c-a', '客户资料批量导入失败', '批量导入客户资料时提示格式错误，模板看起来没有填错。', '数据问题', 'P2', 'PENDING_ASSIGNMENT', 'u-a-s2', NULL, NULL, NULL, NULL, NULL, '2026-10-02T14:00:00.000Z', '2026-10-02T14:00:00.000Z'),
  ('TK-000008', 'c-a', '移动端登录偶发闪退', '手机端登录偶发闪退，重新安装应用后问题仍会出现。', '登录问题', 'P4', 'CANCELLED', 'u-a-s4', NULL, NULL, NULL, NULL, NULL, '2026-10-04T09:00:00.000Z', '2026-10-04T10:00:00.000Z'),
  ('TK-000009', 'c-b', '分支机构网络中断', '分部办公网断连两小时，影响下单系统正常使用。', '网络问题', 'P1', 'COMPLETED', 'u-b-s1', 'g-b1', 'u-b-h1', 'u-b-h1', '2026-10-01T11:30:00.000Z', '2026-10-01T10:30:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T11:30:00.000Z'),
  ('TK-000010', 'c-b', '办公软件授权即将到期', '办公软件授权还剩两周到期，请协助办理续期。', '其他问题', 'P4', 'PENDING_ASSIGNMENT', 'u-b-s1', NULL, NULL, NULL, NULL, NULL, '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:00.000Z');

INSERT OR IGNORE INTO replies (id, ticket_id, author_id, content, created_at) VALUES
  (1, 'TK-000001', 'u-a-h1', '已收到，正在排查登录服务。', '2026-10-01T09:30:00.000Z'),
  (2, 'TK-000001', 'u-a-s1', '补充：同部门同事也遇到同样问题。', '2026-10-01T09:40:00.000Z'),
  (3, 'TK-000002', 'u-a-h1', '验证码服务已修复，请重试登录。', '2026-10-02T10:00:00.000Z'),
  (4, 'TK-000003', 'u-a-h2', '已核对账单差异来源，正在处理中。', '2026-10-03T09:30:00.000Z'),
  (5, 'TK-000006', 'u-a-h2', '已收到开票信息修改请求。', '2026-10-01T16:00:00.000Z'),
  (6, 'TK-000006', 'u-a-s2', '新的开票信息已通过邮件发送给您。', '2026-10-01T16:10:00.000Z'),
  (7, 'TK-000009', 'u-b-h1', '分部网络链路已恢复，请确认业务系统可用。', '2026-10-01T10:30:00.000Z');

INSERT OR IGNORE INTO ratings (id, ticket_id, rater_id, score, comment, created_at) VALUES
  (1, 'TK-000001', 'u-a-s1', 5, NULL, '2026-10-01T11:00:00.000Z'),
  (2, 'TK-000002', 'u-a-s1', 4, '处理很快。', '2026-10-02T12:00:00.000Z'),
  (3, 'TK-000006', 'u-a-s2', 3, NULL, '2026-10-01T18:00:00.000Z'),
  (4, 'TK-000009', 'u-b-s1', 2, '恢复时间偏长。', '2026-10-01T12:00:00.000Z');
