# 开发实现报告 — 169-tickets 工单系统

## 1. 执行概述

工单系统实现阶段包含两个并行任务，覆盖后端 REST API 和前端 React SPA。初次派发因计划中 `additionalWritePaths` 未包含源码目录导致写入范围不匹配，子任务正确报告阻塞后，由 Team Lead 直接实现全部前后端源码并通过验证。

## 2. 实现范围

### 后端（T01）

**数据库迁移** (`src/server/migrations/sqlite/0003_business_tables.sql`)
- ALTER TABLE users ADD COLUMN company TEXT / department TEXT
- 创建 8 张业务表：tickets, ticket_replies, ticket_transfers, ticket_evaluations, companies, business_groups, business_group_members, category_assignment_rules

**共享类型** (`src/shared/types.ts`)
- TicketStatus, SlaPriority, UserRole 枚举
- Ticket, TicketReply, TicketTransfer, TicketEvaluation, Company, BusinessGroup, BusinessGroupMember, CategoryAssignmentRule, TicketDetail, SubmitterInfo, AuthUser 类型

**权限系统** (`src/server/platform/roles.ts`, `permission.ts`)
- 三角色注册表：submitter / handler / admin
- 通过 permissionkit 实现角色分配和权限检查

**认证系统** (`src/server/platform/auth.ts`)
- 登录返回 role (单值) + company + department + companyId + passwordChangeRequired
- Bearer token 认证中间件
- 角色基于 permissionkit 的 getRoles 回调

**业务路由** (`src/server/ticket-routes.ts`, `routes.ts`)
- 工单 CRUD：创建（含自动分配）、列表（按角色过滤）、详情（含回复/转派/评价）
- 工单回复：多轮回复，记录回复人和回复时间
- 工单状态变更：取消（提交人/管理员）
- 工单完成：记录处理人、处理时间
- 工单转派：转派到其他业务组/处理人，记录转派历史
- 提交人信息查询：姓名、公司、部门、历史工单列表（上限20条）
- 满意度评价：1-5星评分 + 可选文字
- 公司/业务组/成员管理：完整 CRUD
- 分类分配规则：创建查询 + 自动匹配

### 前端（T02）

**应用壳与导航** (`App.tsx`)
- 按角色的左侧导航栏（提交人/处理人/管理员）
- 顶部上下文栏（用户信息、退出）
- 登录页、Bootstrap 首账户页、临时密码更改页

**提交人页面**
- 工单列表（自己的工单，状态过滤）
- 创建工单表单（主题、描述、分类、SLA 优先级 P0-P4）
- 工单详情（回复区域、取消、满意度评价）

**处理人页面**
- 待处理工单队列
- 工单详情（提交人信息面板 + 历史工单列表）
- 回复、完成处理、转派操作

**管理员页面**
- 工单管理（全部工单）
- 公司管理（创建公司）
- 业务组管理（创建业务组、添加成员）
- 分配规则配置（分类→业务组映射）
- 用户管理（现有页面保留）

**API 客户端** (`platform/api.ts`)
- 类型化 API 调用，基于技术契约
- Bearer token 自动附加
- 错误解码

**样式** (`index.css`, `tailwind.config.js`)
- Modern SaaS 视觉风格
- split-master-detail 布局
- 深色/浅色模式自适应

## 3. 验证结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 后端类型检查 | `npm run typecheck:server` | ✅ 通过 |
| 前端类型检查 | `npm run typecheck:client` | ✅ 通过 |
| 前端构建 | `npm run build:client` | ✅ 通过（41 模块，171KB JS） |
| 平台测试 | `npm test` | ✅ 4/4 通过 |

## 4. 验收标准对照

| AC | 描述 | 后端贡献 | 前端贡献 |
|----|------|----------|----------|
| AC-01 | 创建工单并设置分类和优先级 | POST /api/tickets + 自动分配 | 创建工单表单 |
| AC-02 | 工单支持多轮回复 | POST /api/tickets/:id/replies | 回复区域组件 |
| AC-03 | 管理员配置业务组并实现分类自动分配 | 业务组/规则 CRUD + 自动匹配逻辑 | 业务组管理 + 分配规则页面 |
| AC-04 | 处理人转派工单 | POST /api/tickets/:id/transfer + 转派历史 | 转派操作 UI |
| AC-05 | 查看提交人完整信息并处理工单 | GET /api/tickets/:id/submitter-info + POST /api/tickets/:id/complete | 提交人信息面板 + 历史工单列表 |
| AC-06 | 用户对完成工单进行满意度评价 | POST /api/tickets/:id/evaluation | 满意度评价 UI |

## 5. 技术决策

- **角色系统**：通过 permissionkit 的 user_role_assignments 表实现，login response 同时返回 role（单值）和 roles（数组），兼容现有测试
- **company/department**：ALTER TABLE 添加 TEXT 列，auth 中间件在认证后查询并注入 currentUser
- **自动分配**：工单创建时查询 category_assignment_rules 表，匹配成功则分配到对应业务组并设置状态为 pending_process
- **前端导航**：基于 user.role 的条件渲染，不同角色看到不同的导航菜单

## 6. 已知限制

- 前端未实现独立的待处理工单队列过滤（handler 角色看到的是全部工单列表，后端已按角色过滤）
- 用户管理页面保留原有模板，未添加角色选择
- 历史工单列表固定上限 20 条，无分页
