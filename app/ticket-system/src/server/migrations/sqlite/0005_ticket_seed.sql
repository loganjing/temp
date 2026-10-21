-- 种子数据（技术契约 §8）：2 家公司、8 个全局问题分类、每公司 2 个演示账号。
-- 演示密码统一 Demo@1234，密码哈希为预计算 scrypt 常量（格式 scrypt:N:r:p:saltB64:hashB64，N=16384, r=8, p=1，keylen 64）。
-- 业务组、分配规则与工单数据不种子化，均经 API 在验收场景中产生。
INSERT INTO companies (id, name, created_at) VALUES
  (1, '示例科技有限公司', '2026-01-01T00:00:00.000Z'),
  (2, '星辰控股集团', '2026-01-01T00:00:00.000Z');

INSERT INTO categories (id, code, name) VALUES
  (1, 'account', '账号与权限'),
  (2, 'billing', '计费与商务'),
  (3, 'bug', '功能缺陷'),
  (4, 'feature', '功能咨询'),
  (5, 'performance', '性能问题'),
  (6, 'integration', '集成对接'),
  (7, 'data', '数据问题'),
  (8, 'other', '其他');

INSERT INTO users (id, username, password_hash, full_name, email, company_id, department, created_at) VALUES
  (1, 'alice', 'scrypt:16384:8:1:MZ1AoQRrL4OVdq/hRVk/aA==:4CoxpotHrJ10pLqsKposottrfOQQtPyvlDJaEdWLEPqF6Frq68sN4tn9Gm6AbOTM3k5u3qsZFYgQJIE/Grx3hw==', '张丽', 'alice@example-tech.cn', 1, '产品部', '2026-01-01T00:00:00.000Z'),
  (2, 'bob', 'scrypt:16384:8:1:MZ1AoQRrL4OVdq/hRVk/aA==:4CoxpotHrJ10pLqsKposottrfOQQtPyvlDJaEdWLEPqF6Frq68sN4tn9Gm6AbOTM3k5u3qsZFYgQJIE/Grx3hw==', '王强', 'bob@example-tech.cn', 1, '客服部', '2026-01-01T00:00:00.000Z'),
  (3, 'carol', 'scrypt:16384:8:1:MZ1AoQRrL4OVdq/hRVk/aA==:4CoxpotHrJ10pLqsKposottrfOQQtPyvlDJaEdWLEPqF6Frq68sN4tn9Gm6AbOTM3k5u3qsZFYgQJIE/Grx3hw==', '李梅', 'carol@xingchen-group.cn', 2, '运营部', '2026-01-01T00:00:00.000Z'),
  (4, 'dave', 'scrypt:16384:8:1:MZ1AoQRrL4OVdq/hRVk/aA==:4CoxpotHrJ10pLqsKposottrfOQQtPyvlDJaEdWLEPqF6Frq68sN4tn9Gm6AbOTM3k5u3qsZFYgQJIE/Grx3hw==', '赵磊', 'dave@xingchen-group.cn', 2, '技术部', '2026-01-01T00:00:00.000Z');
