# 教师管理系统实现报告（k01-teacher）

实现依据：批准需求 `docs/wi-t1000008/requirements.md`（sha256:e43704bc7b6b3c1ef0ae3db2810efd847a684fdd215a516d77238e4c81e67456）与架构基线 `docs/wi-t1000008/architecture-baseline.md`（sha256:9b165343bfd083deb6474d0961208a0c441686a0e9b10b63d450600523687c33）。路线为 `simple-frontend`：React + Vite + Ant Design 单页应用，数据由浏览器 `localStorage` 承载，无服务端、数据库、登录与外部集成。

## 交付行为

教师在单一「教师管理」页面完成增删改查：清单以表格展示教师名称、教授课程、年级、手机、邮箱；新增与编辑共用右侧抽屉表单；删除前弹出二次确认；名称为空或已填写的手机、邮箱格式不符时阻止保存并在字段旁提示，表单其余内容保留。

## 调用链

页面操作 → 页面状态 → 数据模块 → 浏览器存储：

- `src/App.jsx`：清单渲染、新增/编辑入口、删除二次确认、操作结果提示；写入后重新从数据模块读取清单，页面不自行拼接数据。
- `src/components/TeacherFormDrawer.jsx`：新增与编辑共用表单；课程、年级为可增删条目列表，提交时聚合为字符串数组；名称必填规则与手机、邮箱格式规则均取自校验模块。
- `src/lib/teacherStore.js`：唯一存储访问入口，键 `k01-teacher:teachers:v1`，提供读取、新增、按 `id` 更新、按 `id` 删除；写入前统一去除首尾空白并丢弃空的多值条目；存储内容损坏或非数组时降级为空清单而不抛错。
- `src/lib/teacherValidation.js`：`getNameError`、`getMobileError`（`/^1[3-9]\d{9}$/`，留空不校验）、`getEmailError`（常规邮箱格式，留空不校验）、`validateTeacherInput` 汇总。
- `src/main.jsx` / `index.html` / `vite.config.js` / `src/styles.css`：应用挂载、入口、构建配置与工作台视觉。

## 实现范围

- 新增：`package.json`、`index.html`、`vite.config.js`、`README.md`、`src/main.jsx`、`src/App.jsx`、`src/components/TeacherFormDrawer.jsx`、`src/lib/teacherStore.js`、`src/lib/teacherValidation.js`、`src/styles.css`、`tests/teacherStore.test.js`、`tests/teacherValidation.test.js`。
- 依赖：`react`、`react-dom`、`antd`、`@ant-design/icons`；开发依赖 `vite`、`@vitejs/plugin-react`、`vitest`。
- 未引入需求之外的能力：无搜索筛选、排序、分页、统计指标、角色权限；不预置演示数据。

## 验收条件覆盖（开发自检口径）

| AC | 实现落点 | 本阶段证据 | 状态 |
| --- | --- | --- | --- |
| AC-01 清单展示五项信息，多值逐条展示 | `src/App.jsx` 表格列：课程、年级以标签逐条渲染 | 构建通过，`npm run build` 产出 `dist/`；页面渲染待 QA 浏览器验收 | 代码就绪，运行时待验收 |
| AC-02 新增后可读回 | `addTeacher` 写入 → `readTeachers` 读回 → 清单重渲染 | 单测：新增后读回五项字段、课程与年级多条目完整 | 数据链路已验证，交互待验收 |
| AC-03 编辑后原地更新不重复 | `updateTeacher` 按 `id` 映射替换 | 单测：更新后条数不变、目标字段更新、其他记录不受影响 | 数据链路已验证，交互待验收 |
| AC-04 删除经确认后移除且不影响其他记录 | `modal.confirm` + `deleteTeacher` | 单测：仅移除目标记录，其余保持原值 | 数据链路已验证，交互待验收 |
| AC-05 非法输入阻止保存并显示字段提示 | 表单规则 + 校验模块 | 单测：名称空白、手机位数/前缀错误、邮箱格式错误均返回提示；留空不报错 | 规则已验证，交互待验收 |

## 开发验证证据

| checkId | 命令 | 工作目录 | 退出码 | 结果 |
| --- | --- | --- | --- | --- |
| unit-tests | `npm run test` | 工作项工作区根目录 | 0 | 2 个测试文件、15 个用例全部通过（数据模块 9 个、校验规则 6 个） |
| production-build | `npm run build` | 工作项工作区根目录 | 0 | Vite 构建成功，产出 `dist/index.html`、CSS 3.52 kB、JS 952.36 kB（gzip 303.31 kB）；仅提示 chunk 体积超过 500 kB，不影响运行 |
| dev-server | `npm run dev` | 工作项工作区根目录 | 后台运行 | http://127.0.0.1:5173/ 就绪（Vite 5.4.21，88 ms 启动） |

本阶段未执行浏览器交互、刷新读回与页面视觉验收，这些由 QA 阶段独立验证。构建与单测通过不代表交付验收通过。

## QA 交接

- 启动：在工作项工作区根目录执行 `npm install`（已安装则跳过），再执行 `npm run dev`；访问 http://127.0.0.1:5173/ ，无需登录，无初始账号。
- 数据准备：应用首次访问为空清单。可在页面用「新增教师」录入测试数据；也可在浏览器控制台执行 `localStorage.removeItem('k01-teacher:teachers:v1')` 后刷新，回到空清单状态。
- 持久化验证：保存记录后在浏览器刷新页面，清单应读回同样内容（同一浏览器配置文件内）。
- 建议覆盖：空清单状态与新增入口；含两门课程、两个年级的记录的清单展示；新增、编辑、删除（确认与取消两条路径）；名称为空、手机 10 位、邮箱缺 `@` 的字段提示，以及提示时已填课程与年级是否保留。

## 遗留风险与边界

- 数据仅存于当前浏览器 `localStorage`，不跨设备、跨浏览器、跨用户同步，也无跨用户隔离需求之外的权限控制（需求未规定）。
- 课程与年级保存时会丢弃空条目；若用户只填写了空行，该字段按未填写处理，这是「整体留空视为未填写」的直接实现。
- 需求未规定名称、手机、邮箱唯一性，实现未做唯一性限制。
- `dist/` 构建产物与 `node_modules/` 属常规构建输出，不作为交付产物，源码交付不依赖本地已有构建结果。