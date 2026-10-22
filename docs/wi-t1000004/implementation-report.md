# 教师管理系统 实现报告（142-teachers）

- Work Item：`wi-t1000004`
- 阶段：implementation（第 3 阶段）
- 应用形态：`simple-frontend`（React + Vite 单页应用，数据存于浏览器 `localStorage`）
- 依据需求：`docs/wi-t1000004/requirements.md`（sha256 `c067b511caa5dd9daf9f82f38225d4f831018bfe933af605f5dd6ca4e14445bf`）
- 依据架构基线：`docs/wi-t1000004/architecture-baseline.md`（sha256 `9f8041b81011a5bdb120b38a30352d6acd405848c98a0cf09e328d73f65f4271`）

## 1. 交付内容概览

按架构基线落地的单页应用，覆盖教师信息的查看、新增、编辑、删除四类操作，字段为教师名称、教授课程、年级、手机、邮箱。

调用链（单向，无服务端参与）：

```text
TeacherTable / TeacherDetail（界面入口）
  → App.handleSave / confirmDelete（页面状态编排）
  → domain/teacher.validateTeacher（业务规则与校验）
  → services/teacher-repository（add/update/remove + localStorage 读写边界）
  → 列表重新渲染 + 成功反馈
```

源码清单：

| 文件 | 职责 |
| --- | --- |
| `src/domain/teacher.ts` | 教师模型、字段口径、校验规则、id 生成 |
| `src/services/teacher-repository.ts` | `localStorage` 读写边界与列表增删改纯函数 |
| `src/App.tsx` | 页面状态与四类操作的编排、成功反馈 |
| `src/components/TeacherTable.tsx` | 列表展示、行操作、空态与计数 |
| `src/components/TeacherForm.tsx` | 新增/编辑表单、字段级校验提示 |
| `src/components/TeacherDetail.tsx` | 教师详情（五个字段完整展示） |
| `src/components/ConfirmDialog.tsx` | 删除确认（应用内确认，不阻塞流程） |
| `src/main.tsx`、`index.html`、`vite.config.ts`、`tsconfig.json`、`README.md` | 应用入口与工程配置 |

## 2. 验收条件实现情况（开发侧）

以下为代码实现与开发自检层面的结论；真实浏览器操作、刷新读回与完整用户流程由 QA 阶段按验收计划验证，本报告不代替 QA 出具验收结论。

### AC-01 新增教师并可读回

- 入口：列表右上角「新增教师」按钮 → `TeacherForm`（`mode=create`）→「保存」。
- 规则：提交时调用 `validateTeacher`，校验通过后 `addTeacher` 追加记录（生成 id 并统一去空白），`useEffect` 将列表写回 `localStorage` 的 `teacher-management:teachers`；保存后显示反馈「已保存教师「张老师」」，列表立即出现该记录。
- 五个字段（教师名称、教授课程、年级、手机、邮箱）原值写入并在列表列中读回。
- 状态：开发侧实现完成、单元测试通过；浏览器操作与读回待 QA 验证。

### AC-02 查看教师列表与详情

- 入口：列表默认展示全部记录（教师名称、教授课程、年级、手机、邮箱 + 操作列）；行内「查看」或详情触发后打开 `TeacherDetail`。
- 一致性：详情与列表同源，均直接取自同一份 `teachers` 状态，详情按固定字段顺序渲染五个字段，不存在字段错位或缺失来源。
- 空数据态：无记录时表格显示「暂无教师记录，点击「新增教师」添加第一条记录。」
- 状态：开发侧实现完成；浏览器渲染一致性待 QA 验证。

### AC-03 修改教师信息并读回

- 入口：行内「编辑」或详情中的「编辑」→ `TeacherForm`（`mode=edit`，载入当前五字段原值）→「保存」。
- 规则：`updateTeacher` 仅替换目标 id 记录的五个字段，其他记录与目标 id 保持不变（见单元测试「修改只影响目标记录」）；保存后显示「已更新教师「张老师」」。若编辑入口来自详情，详情抽屉保持打开并同步展示更新后的值。
- 状态：开发侧实现完成、单元测试通过；浏览器读回待 QA 验证。

### AC-04 删除教师记录

- 入口：行内「删除」或详情中的「删除」→ 应用内确认对话框「确认删除教师「张老师」？」→「确认删除」。
- 规则：`removeTeacher` 过滤掉目标 id 后写回存储并刷新列表；其他记录不受影响（见单元测试「删除移除目标记录且不影响其他记录」）。删除当前详情中的教师时详情自动关闭。
- 状态：开发侧实现完成、单元测试通过；浏览器验证待 QA 执行。

### AC-05 录入必填与格式校验

- 规则实现（`validateTeacher`）：
  - 教师名称：必填（含纯空白视为空），提示「教师名称不能为空」。
  - 手机：必填且需匹配 `^1[3-9]\d{9}$`；`123` 等非法值提示「手机格式不正确，请输入 11 位手机号，例如 13800000000」。
  - 邮箱：必填且需含 `@` 与点分域名；`abc` 等非法值提示「邮箱格式不正确，请输入形如 zhang@example.com 的邮箱」。
  - 教授课程、年级：需求未规定必填，为空允许保存。
- 阻止保存：表单 `handleSubmit` 在存在字段错误时不调用 `onSave`，仅渲染字段级错误提示（`role="alert"`），列表不产生新记录；提交失败后随输入实时复核提示。
- 状态：开发侧实现完成、单元测试通过；浏览器提示与列表反馈待 QA 验证。

## 3. 口径说明（需用户知悉的实现判断）

1. **教授课程、年级**：需求未规定取值范围，按单值自由文本处理，不引入预置选项或多值结构。
2. **手机、邮箱为空**：需求第 7 条要求「手机、邮箱按基本格式校验，不满足时阻止保存」。空值视为不满足基本格式，因此二者与教师名称同为必填，可保证每条记录五个字段完整；若用户希望允许留空，只需放宽 `validateTeacher` 中的必填分支，属可逆调整。
3. **数据存储**：使用 `localStorage`，因此数据在同一浏览器刷新或重新打开后仍然保留，范围强于需求所承诺的「同一使用过程读回」。数据不跨浏览器、设备或用户共享，与需求边界一致。

## 4. 开发自检证据

工作目录：本 Work Item 工作区根目录（`.lingee-task-worktrees/wi-t1000004`）。

| checkId | 命令 | 状态 | 退出码 | 证据 |
| --- | --- | --- | --- | --- |
| `npm-install` | `npm install --no-audit --no-fund` | passed | 0 | 安装 98 个包完成，生成 `package-lock.json` |
| `typecheck` | `npm run typecheck`（`tsc --noEmit`） | passed | 0 | 无类型错误输出 |
| `unit-tests` | `npm run test`（`vitest run`） | passed | 0 | 2 个测试文件、20 个用例全部通过（`src/domain/teacher.test.ts` 11 个，`src/services/teacher-repository.test.ts` 9 个） |
| `build` | `npm run build`（`tsc --noEmit && vite build`） | passed | 0 | 1577 个模块转换完成，产出 `dist/index.html`、`dist/assets/index-DdOae-Vq.css`（6.71 kB）、`dist/assets/index-B_ukUtS5.js`（155.23 kB） |
| `dev-server` | `npm run dev`（后台注册作业） | passed | 运行中 | Vite 就绪，`GET http://127.0.0.1:5199/` 与 `GET /src/main.tsx` 均返回 200 |

单元测试覆盖的开发侧风险点：五字段校验（必填、手机格式、邮箱格式、多处错误一次给出）、去空白规范化、新增/修改/删除的列表语义（修改只影响目标记录、删除不影响其他记录）、存储读回一致性、损坏存储降级为空列表、无可用存储时不抛错。

前端预览地址：`http://127.0.0.1:5199/`（实现阶段仅提供预览入口，浏览器观测结果不计入验收证据）。

## 5. 交 QA 的验收项

| checkId | 前置条件 | 验证动作 | 预期结果 |
| --- | --- | --- | --- |
| `qa-ac01-create-readback` | 打开应用 | 新增教师并填写「张老师 / 数学 / 三年级 / 13800000000 / zhang@example.com」后保存 | 保存成功并出现成功反馈；列表中新增该记录；列表或详情读回五个字段与提交一致 |
| `qa-ac02-list-detail` | 已有至少两名教师 | 打开列表并记录展示内容，再打开其中一名教师的详情 | 列表展示全部记录及字段；详情与列表一致，无缺失或错位字段 |
| `qa-ac03-update-readback` | 已有教师记录 | 编辑某教师的手机与邮箱后保存，再重新打开该记录 | 保存成功；读回为更新后的手机与邮箱；其他字段未被改动 |
| `qa-ac04-delete` | 已有至少两名教师 | 删除其中一名教师并重新打开列表 | 该记录不再出现在列表中；其他记录不受影响 |
| `qa-ac05-validation` | 打开应用 | 分别提交「教师名称留空」「手机=123」「邮箱=abc」 | 三次均保存失败并提示对应字段；列表中未产生新记录 |

## 6. 遗留风险与边界

- 未执行浏览器端 E2E、视觉与完整用户流程验收，均留给 QA 阶段；本报告不声称交付验收通过。
- 无服务端、无认证与权限控制，与需求「角色与权限未规定」一致，不属于本次实现范围。
- 未提供检索、分页与批量操作，需求未要求。
- 第 3 节第 2 条的口径如需调整，属前端校验分支的可逆修改，不影响数据存储结构。