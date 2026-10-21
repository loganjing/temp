# 实现报告：教师管理系统（WorkItem: wi-t1000325 · 阶段 implementation）

## 变更行为与实现依据

本阶段按已批准的需求基线（`docs/wi-t1000325/requirements.md`）与架构基线（`docs/wi-t1000325/architecture-baseline.md`）从零交付教师管理系统的完整可运行实现：单页应用提供教师的**新增、查询、修改、删除**四类管理操作，字段为教师名称、教授课程、年级、手机、邮箱五项，写入结果以查询读回为准。

- 架构依据：路由分类 `simple-frontend`（compact 路线），React + Vite SPA（TypeScript），`localStorage` 为唯一持久化边界，无服务端、无路由库。
- 实现依据：新建应用场景（worktree 内此前仅有工作项台账与文档，无既有业务行为、数据或对外契约需要保持）。

## 调用链

全部交互在单页内由应用状态切换（列表 / 表单 / 删除确认），数据读写闭环如下：

```
用户操作（表格/表单/确认框）
  → src/App.tsx（视图状态与操作编排，写后 refreshList 读回）
  → src/validation.ts（名称必填；手机/邮箱提示性格式校验；各字段去首尾空白；失败则表单内提示、不写入）
  → src/store/teacherStore.ts（唯一数据存取模块：list / create / update / delete / find）
  → localStorage[teacher-management.teachers.v1]（JSON 数组，id 为 crypto.randomUUID()）
  → 重新 listTeachers() 渲染列表（写入结果以读回为准）
```

界面组件不直接操作存储键；存储内容损坏（非法 JSON / 非数组 / 记录字段类型不符）时按空列表或忽略该条处理，不阻塞页面加载。

## 实现范围（文件清单）

| 路径 | 说明 |
| --- | --- |
| `package.json` | 依赖与脚本（dev / build / typecheck / test） |
| `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json` | TypeScript 项目结构（strict） |
| `vite.config.ts` | Vite + React 插件；Vitest 配置（jsdom 环境） |
| `index.html` | 应用入口（zh-CN） |
| `src/main.tsx` | React 挂载入口 |
| `src/types.ts` | `Teacher` / `TeacherDraft` 类型（字段语义与需求基线一致） |
| `src/store/teacherStore.ts` | 数据存取模块（唯一持久化边界，含异常输入降级） |
| `src/validation.ts` | 最小必要校验（名称必填；手机/邮箱提示性校验；去空白） |
| `src/App.tsx` | 单页视图状态与增删改查编排 |
| `src/components/TeacherTable.tsx` | 教师列表（五字段表格 + 编辑/删除入口；空状态提示） |
| `src/components/TeacherForm.tsx` | 新增/编辑表单（编辑预填；校验失败表单内提示不写入） |
| `src/components/ConfirmDialog.tsx` | 删除确认弹层 |
| `src/styles/global.css` | 紧凑业务风格样式 |
| `src/vite-env.d.ts` | Vite 客户端类型声明 |
| `tests/teacherStore.test.ts` | 存取模块单元测试（12 个用例） |
| `tests/validation.test.ts` | 校验模块单元测试（11 个用例） |
| `README.md` | 功能、运行方式、校验规则说明 |

生成物：`npm run build` 产出 `dist/`（静态资源，未提交、未部署）。未引入路由库、服务端、认证或外部集成。

## 开发验证证据

| checkId | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
| --- | --- | --- | --- | --- | --- |
| CHK-TYPECHECK | `npm run typecheck`（tsc -b，strict） | 仓库根 | 通过 | 0 | 首轮发现 `src/main.tsx` CSS 模块声明缺失（TS2307），补 `src/vite-env.d.ts` 后重跑通过 |
| CHK-UNIT | `npm test`（vitest run，jsdom） | 仓库根 | 通过 | 0 | 23/23 用例通过：存取模块 12（读回、顺序、id 唯一、损坏降级、update/delete 不存在时不改变存储、删除不影响他条）；校验模块 11（必填、手机/邮箱格式正反例、多错误并报、去空白） |
| CHK-BUILD | `npm run build`（tsc -b && vite build） | 仓库根 | 通过 | 0 | 34 个模块转换成功，产出 `dist/index.html` + 1 CSS + 1 JS |
| CHK-PREVIEW | `npm run dev`（注册后台作业） + `curl http://localhost:5178/` | 仓库根 | 通过 | 0 | Vite 就绪，`HTTP_STATUS=200` 返回应用入口 HTML |

前端预览入口：`http://localhost:5178/`（开发服务器以后台注册作业运行；端口 5173–5177 被其他任务占用，Vite 自动选择 5178）。该入口仅作为预览提供，不构成验收证据；实现阶段未执行浏览器操作。

## 验收断言状态（AC-01：界面完成教师记录完整增删改查闭环）

| 子断言 | 状态 | 证据 |
| --- | --- | --- |
| 新增教师：五字段录入并保存，列表出现该教师 | 已实现（代码+单测）；浏览器验收待 QA | `createTeacher` 写入后 `listTeachers`/`findTeacher` 读回一致（单测）；UI 链路见调用链；QA 走 AC-01 步骤 1 |
| 查看教师：五个字段均显示且与录入值一致 | 已实现（代码+单测）；浏览器验收待 QA | 列表表格五字段渲染 `TeacherTable`；存储读回保真（单测）；QA 走 AC-01 步骤 2 |
| 修改教师（手机改新值）并保存 | 已实现（代码+单测）；浏览器验收待 QA | `updateTeacher` 修改后读回新值、其余字段不变（单测）；表单预填当前值；QA 走 AC-01 步骤 3 |
| 再次查看显示新值 | 已实现（代码+单测）；浏览器验收待 QA | 同上（update 读回断言）；QA 走 AC-01 步骤 4 |
| 删除教师后列表不再出现 | 已实现（代码+单测）；浏览器验收待 QA | `deleteTeacher` 后 `listTeachers`/`findTeacher` 均无该记录、他条不受影响（单测）；QA 走 AC-01 步骤 5 |

说明：按开发/QA 分工，单元测试覆盖业务规则、边界与状态变化；真实入口可达、界面交互、刷新读回与浏览器闭环（interaction、runtime-render 证据）由 QA 在验收阶段执行，本阶段不代替出具浏览器验收通过证据。

## 遗留风险与建议

- 风险（低）：`crypto.randomUUID` 需要安全上下文；已提供降级路径，非安全上下文仍可生成唯一 id。
- 风险（低）：手机/邮箱校验为“基本格式”提示性校验（需求未规定具体格式），文案已在表单内说明。
- 待 QA 验证项（非阻断）：AC-01 的浏览器端完整闭环（新增→查看→修改→再查看→删除→列表确认）；刷新/重开页面后数据仍在（localStorage 读回）。
- 基线更新建议：无。实现未偏离已批准需求与架构基线。
