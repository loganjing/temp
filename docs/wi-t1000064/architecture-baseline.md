# 系统设计：资产领用单（wi-t1000064）

路线：fullstack-complex（完整全栈路线）。设计输入为已批准的需求基线 `docs/wi-t1000064/requirements.md`（SHA-256 已校验）。本设计只给出必要的技术承载方式，不扩展或重裁产品语义。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

**形态**：单体 Node 进程（Hono）同时承载 REST API 与前端静态资源；React/Vite SPA 前端；SQLite 文件数据库为唯一权威数据源。无认证、无权限、无工作流、无消息、无导入导出（需求 §4 明确不启用）。

**功能边界**：领用单录入保存（含校验与自动编号）、条件查询、单据详情回读、打印模板输出。需求未定义已保存单据的编辑旅程，本设计不提供修改接口；`modifier`/`modifytime` 记录最近一次保存操作的用户与时间（创建即首次保存）。

**技术栈**：

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js ≥ 24 | 单进程 |
| 服务端 | Hono（TypeScript，tsx 运行） | REST API + 静态托管，应用包根 `app/asset-apply/` |
| 前端 | React 18 + Vite（TypeScript，react-router） | SPA，构建产物由服务端托管 |
| 数据库 | SQLite 文件库，复用 CommonApp 通用模块 `@commonapp/dbkit` | 配置、查询、事务、迁移由通用模块承载 |
| 迁移 | dbkit `runMigrations`（SQL 位于 `src/server/migrations/sqlite/`） | 启动时自动应用，禁止运行时改 schema |
| 包管理 | npm workspaces（`app/*`） | CommonApp 模块经本地 `vendor/` 目录以 file: 引用安装 |

**关键决策**（一次性冻结）：

- 单号权威生成：保存事务（dbkit `db.transaction`）内通过序列表 `billno_seq` 原子取号，`billno` 列 UNIQUE 约束兜底；SQLite 写事务串行化避免并发重号。单日流水超过 9999 时自动扩位，唯一性优先于固定位数。
- 数据层复用 CommonApp 通用模块 dbkit（模块记录见 §2）：SQLite 配置、查询、事务、版本化迁移四项能力覆盖本设计数据层全部需求；项目本就依赖 npm 安装（React、Vite、Hono、tsx），引入其原生驱动 better-sqlite3 的边际成本低，复用成熟实现减少自研迁移运行器与事务封装的实现与测试面。
- 服务端为校验权威（必填、分录非空、行级资产名称非空）；前端提交前做同样预检，提示文案与服务端一致，保证 AC-02 的用户可见反馈。
- 系统字段（creator/createtime/modifier/modifytime、分录 modifierfield/modifydatefield、billno）全部由服务端在保存事务内生成，客户端不可传入。
- 无用户体系：picker/pick_dept/org 为受控文本存储（前端文本输入），不引入基础资料管理模块（需求未要求）；creator/modifier 由服务端填充默认用户标识。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

```
Browser（React SPA：列表/筛选 · 新建表单 · 详情 · 打印视图）
   │  HTTP /api/asset-apply-bills*
   ▼
Hono 单进程服务（runMigrations → createDb → API + 静态托管）
   │  @commonapp/dbkit（better-sqlite3）
   ▼
SQLite 文件库（data/application.db，DB_PATH 可覆盖）
   ├─ asset_apply_bill        领用单主表（唯一数据归属）
   ├─ asset_apply_bill_entry  明细分录（从属主表）
   └─ billno_seq              单号序列（取号权威）
```

**模块职责与数据归属**：

| 模块 | 位置 | 职责 | 数据归属 |
| --- | --- | --- | --- |
| 单据模块 | `app/asset-apply/src/server/`（routes/services） | 保存校验、单号分配、主表与分录持久化、条件查询、详情回读 | SQLite 三张表（唯一事实来源） |
| 数据访问与迁移 | `app/asset-apply/src/server/platform/bootstrap.ts` 与 `src/server/migrations/sqlite/` | dbkit 绑定：`createDb`（`DB_PATH` 覆盖、自动建父目录）、`runMigrations` 版本化迁移、导出 `db` 与事务入口 | `schema_migrations` |
| 前端应用 | `app/asset-apply/src/client/` | 列表筛选、新建表单（分录行编辑）、详情回读、打印视图 | 无独立数据归属，只消费单据模块接口 |
| 共享契约 | `app/asset-apply/src/shared/` | 前后端共用的字段类型、错误码等平台中立契约 | 无独立数据归属 |

**接口摘要**（字段级契约的唯一来源为 `docs/wi-t1000064/technical-contract.md`）：

| 接口 | 方向 | 用途 |
| --- | --- | --- |
| `POST /api/asset-apply-bills` | 前端 → 单据模块 | 创建保存：权威校验 → 事务取号 → 落库，返回含单号与系统字段的完整单据 |
| `GET /api/asset-apply-bills` | 前端 → 单据模块 | 按领用单号（包含匹配）、领用人（包含匹配）、领用日期（精确）条件查询，分页 |
| `GET /api/asset-apply-bills/:id` | 前端 → 单据模块 | 详情回读（主表 + 分录，按 seq 排序） |
| 前端路由 `/` | — | 列表与筛选，主操作“新建领用单” |
| 前端路由 `/bills/new` | — | 新建表单（主表字段 + 分录行编辑，数量默认 1） |
| 前端路由 `/bills/:id` | — | 单据详情（回读数据） |
| 前端路由 `/bills/:id/print` | — | 打印视图（A4 纵向 print CSS + 签章区），浏览器打印输出 |

**通用模块复用**（CommonApp，经 npm 安装）：

| 项 | 值 |
| --- | --- |
| 模块 ID | dbkit |
| 模块安装标记 | commonapp install: dbkit |
| 包与版本 | @commonapp/dbkit 0.2.0（catalog 状态 ready，manifest 校验通过） |
| manifest SHA-256 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| 需求匹配 | SQLite 配置（createDb/createDbConfig，sqlitePath 支持 `DB_PATH` 覆盖）、查询（queryOne/queryAll）、事务（db.transaction）、版本化迁移（runMigrations，`migrations/sqlite/`）——覆盖数据层全部需求 |
| 集成边界 | 经工作区本地 `vendor/@commonapp/dbkit` 以 file: 引用、npm workspaces 统一安装；包清单与锁文件由包管理器负责；接线状态与入口见根目录 `platform-baseline.json`（dbkit: wired） |
| 限制 | 仅支持 SQLite 驱动；运行时依赖 better-sqlite3（^11 \|\| ^12，原生模块，预编译二进制随 npm 安装） |
| 未选模块 | authkit / userkit / permissionkit / auditkit / attachment / i18n——需求明确不启用认证、权限、操作日志，且无附件与国际化功能 |

## 3. 数据模型、事务与迁移

表结构（列名与需求字段编码一致，API 字段与列同名，无映射转换）：

**asset_apply_bill（主表）**

| 列 | 类型 | 可空 | 默认/生成 | 说明 |
| --- | --- | --- | --- | --- |
| id | INTEGER PK | 否 | 自增 | 内部主键 |
| billno | TEXT UNIQUE | 否 | 保存事务生成 | `LYyyyyMMdd` + 4 位流水 |
| pick_date | TEXT | 否 | — | `yyyy-MM-dd` |
| picker | TEXT | 否 | — | 领用人 |
| pick_dept | TEXT | 否 | — | 领用部门 |
| org | TEXT | 否 | — | 组织 |
| purpose | TEXT | 是 | NULL | 用途说明 |
| remark | TEXT | 是 | NULL | 备注 |
| billstatus | TEXT | 否 | `'创建'` | 系统预置（创建/已提交/已审核），本需求无流转操作 |
| creator | TEXT | 否 | 保存时服务端填充 | 默认用户标识 |
| createtime | TEXT | 否 | 保存时服务端填充 | `yyyy-MM-ddTHH:mm:ss` |
| modifier | TEXT | 否 | 同 creator | 最近一次保存人 |
| modifytime | TEXT | 否 | 同 createtime | 最近一次保存时间 |
| auditor | TEXT | 是 | NULL | 仅字段保留 |
| auditdate | TEXT | 是 | NULL | 仅字段保留 |

**asset_apply_bill_entry（分录，从属主表）**

| 列 | 类型 | 可空 | 默认/生成 | 说明 |
| --- | --- | --- | --- | --- |
| id | INTEGER PK | 否 | 自增 | 内部主键 |
| bill_id | INTEGER FK→asset_apply_bill(id) | 否 | — | 级联删除（随主表事务） |
| seq | INTEGER | 否 | 按录入顺序 1 起 | 行号 |
| asset_name | TEXT | 否 | — | 资产名称 |
| asset_code | TEXT | 是 | NULL | 资产编码 |
| spec_model | TEXT | 是 | NULL | 规格型号 |
| qty | NUMERIC | 否 | 1 | 数量 |
| unit | TEXT | 是 | NULL | 单位 |
| location | TEXT | 是 | NULL | 存放位置 |
| line_remark | TEXT | 是 | NULL | 行备注 |
| modifierfield | TEXT | 否 | 保存时服务端填充 | 默认用户标识 |
| modifydatefield | TEXT | 否 | 保存时服务端填充 | `yyyy-MM-ddTHH:mm:ss` |

**billno_seq（单号序列）**

| 列 | 类型 | 说明 |
| --- | --- | --- |
| prefix | TEXT PK | `LYyyyyMMdd`（服务器本地日期） |
| next_seq | INTEGER | 下一个可用流水号，初始 1 |

**保存事务**（dbkit `db.transaction` 承载，单写事务，抛错整体回滚）：`INSERT OR IGNORE` 初始化当日前缀 → `UPDATE billno_seq SET next_seq=next_seq+1 WHERE prefix=? RETURNING next_seq-1` 取流水号 → 插入主表 → 插入全部分录 → 提交。任一步失败整体回滚，序列与单据保持一致；`billno` UNIQUE 索引为并发兜底防线。

**迁移**：`app/asset-apply/src/server/migrations/sqlite/0001_init.sql` 创建三表与索引（billno 唯一索引、entry 的 bill_id 索引）。启动时经 dbkit `runMigrations`（绑定于 `platform/bootstrap.ts`，directory 指向 `src/server/migrations/`，SQLite 脚本位于其 `sqlite/` 子目录）在 `schema_migrations` 登记版本并按序应用；数据库结构变更必须新增编号迁移文件，禁止 ORM 同步或手工改 schema。

## 4. 全局 UI 基线

- **展示模板**：`split-master-detail`。主工作区为单据列表（含筛选）与单据详情/表单协同；列表主操作“新建领用单”进入表单区，选中行展示详情。依据：核心旅程为录入→保存→打印→按条件查询追溯（AC-01/04/05），查询命中后高频打开详情与打印。
- **视觉风格**：Modern SaaS。柔和中性色、细边界、少阴影、中等圆角、清晰字体；一个主色（蓝系）+ 状态色（成功/警告/错误）；短而有反馈的动效。表格优先保证可扫读。
- **应用壳**：顶部应用栏（应用名 + “新建领用单”主按钮）+ 主工作区（列表/筛选与详情/表单分区）。
- **目标设备**：桌面 Web（需求仅要求主流浏览器，无窄屏专项要求）。
- **全局状态**：
  - 加载：列表与详情加载指示。
  - 空态：无单据时列表空态引导新建；表单分录为空时显示引导行。
  - 错误：表单字段级提示（主表必填）+ 提交失败汇总提示，文案与服务端一致——「明细分录不能为空」「资产名称不能为空」及各必填字段提示；查询失败显示可重试错误。
  - 成功：保存成功提示并展示生成的领用单号（AC-03）。
- **打印视图**：独立路由，A4 纵向 `@media print` 样式（隐藏应用壳）。内容：主表信息（领用单号、领用日期、领用人、领用部门、用途说明、备注）、分录表格（资产名称、资产编码、规格型号、数量、单位、存放位置）、签章区（领用人签字、部门负责人签字、资产管理员签字、日期）。

## 5. 运行与可靠性

- **依赖安装**：工作区根 `npm install`（npm workspaces 安装 `app/asset-apply` 与本地 `vendor/` 的 `@commonapp/dbkit`，含原生驱动 better-sqlite3 的预编译二进制）。
- **启动命令**（于工作区根执行）：
  - 构建：`npm run build`（应用包 typecheck + Vite 构建前端至 `app/asset-apply/dist/`）。
  - 生产启动：`npm start`（node --import tsx 运行 `app/asset-apply/src/server/index.ts`：`initializePlatform` 内 `runMigrations` 应用迁移 → `createDb` 打开数据库 → 同端口服务 API 与静态资源）。
  - 开发：`npm run dev`（并行 Vite dev server 与 tsx watch 服务端，`/api` 代理至本地 Hono）。
  - 测试：`npm test`（应用包 `test/*.test.mjs`：dbkit 启动迁移、平台 HTTP 行为基线）。
- **端口**：默认 3000，`PORT` 环境变量覆盖；隔离验证使用空闲端口。
- **数据库路径**：默认 `data/application.db`（应用包运行目录，由 dbkit 绑定 `createDbConfig` 的 `sqlitePath` 配置，打开前自动创建父目录）；`DB_PATH` 环境变量覆盖，支持 `:memory:`（隔离验证用独立路径文件或内存库）。
- **性能**：单进程 + 本地文件库，同步写事务仅在保存时短暂持有，满足保存响应 ≤ 2 秒（AC-01）；查询为只读索引扫描。
- **可靠性**：保存整体原子（单号、主表、分录同事务提交或回滚）；服务重启后数据与序列持久保留；干净目录与默认数据库路径无需人工准备即可运行。
