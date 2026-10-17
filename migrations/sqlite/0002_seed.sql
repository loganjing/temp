-- 工单系统（121-full）种子数据
-- 两家公司、覆盖提交人/处理人/公司管理员的用户、初始分类列表
-- 保证干净目录启动即可进入验收场景（业务组/分配规则由验收动作创建）

INSERT INTO companies (id, name) VALUES
  (1, '星云科技'),
  (2, '远航制造');

-- 公司 1（星云科技）：公司管理员 1 名、提交人 1 名、处理人 2 名
-- 公司 2（远航制造）：公司管理员 1 名、提交人 1 名、处理人 1 名
INSERT INTO users (id, name, email, company_id, department, is_company_admin) VALUES
  (1, '王管理', 'admin.wang@nebula.example', 1, '运营部', 1),
  (2, '李提交', 'submitter.li@nebula.example', 1, '市场部', 0),
  (3, '赵网络', 'handler.zhao@nebula.example', 1, 'IT服务部', 0),
  (4, '钱软件', 'handler.qian@nebula.example', 1, 'IT服务部', 0),
  (5, '孙管理', 'admin.sun@yuanhang.example', 2, '综合部', 1),
  (6, '周提交', 'submitter.zhou@yuanhang.example', 2, '生产部', 0),
  (7, '吴处理', 'handler.wu@yuanhang.example', 2, '运维部', 0);

INSERT INTO categories (id, name) VALUES
  (1, '网络问题'),
  (2, '软件问题'),
  (3, '硬件问题'),
  (4, '账号权限'),
  (5, '其他');
