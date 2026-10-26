# 教师管理系统实现报告

## 变更行为与根因

基于已批准的需求基线（`docs/wi-t1000045/requirements.md`）和架构基线（`docs/wi-t1000045/architecture-baseline.md`），从零实现了一个 React + Vite 单页应用，提供教师记录的增删改查（CRUD）能力。数据持久化使用浏览器 `localStorage`，无服务端 API。

## 调用链

```
App.jsx (状态管理 + 事件分发)
  → TeacherForm.jsx (新增/编辑表单，模态呈现)
  → TeacherList.jsx (列表渲染 + 编辑/删除入口)
  → lib/storage.js (CRUD 读写 localStorage)
  → lib/fields.js (字段定义 + 校验)
```

- **新增**：`App.handleAdd` → `TeacherForm` 填写 → `validateTeacher` → `createTeacher` → 刷新列表
- **查看**：`App` 挂载时 `loadTeachers` → `TeacherList` 渲染表格
- **编辑**：`App.handleEdit` → `TeacherForm` 预填 → `validateTeacher` → `updateTeacher` → 刷新列表
- **删除**：`App.handleDelete` → `deleteTeacher` → 刷新列表

## 实现范围

| 文件 | 职责 |
|------|------|
| `package.json` | 项目依赖与脚本 |
| `vite.config.js` | Vite + React 插件配置，含 jsdom 测试环境 |
| `index.html` | SPA 入口 |
| `src/main.jsx` | React 渲染入口 |
| `src/App.jsx` | 应用根组件，CRUD 状态与事件管理 |
| `src/components/TeacherList.jsx` | 教师列表表格，含编辑/删除按钮 |
| `src/components/TeacherForm.jsx` | 新增/编辑模态表单 |
| `src/lib/storage.js` | localStorage CRUD 操作 |
| `src/lib/fields.js` | 字段定义、校验逻辑、空记录工厂 |
| `src/styles/index.css` | 全局样式 |
| `tests/storage.test.js` | 存储 CRUD 单元测试（8 项） |
| `tests/fields.test.js` | 字段校验单元测试（6 项） |
| `tests/crud-integration.test.js` | 完整 CRUD 周期集成测试（1 项） |

## 字段映射

| 需求字段 | 字段键 | 校验 |
|----------|--------|------|
| 教师名称 | `name` | 必填 |
| 教授课程 | `course` | 必填 |
| 年级 | `grade` | 必填 |
| 手机 | `phone` | 必填（不强制格式校验） |
| 邮箱 | `email` | 必填（不强制格式校验） |

## 验收场景实现对照

- **AC-01（新增后列表读回）**：`createTeacher` 写入 `localStorage`，列表通过 `loadTeachers` 读回并渲染，五个字段值与录入一致。
- **AC-02（编辑后读回更新）**：`updateTeacher` 按 ID 定位记录并合并修改字段，未修改字段保持原值，列表刷新后展示更新值。
- **AC-03（删除后列表不包含）**：`deleteTeacher` 按 ID 从数组中移除并持久化，刷新后列表不再包含该记录。

## 开发验证证据

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|--------|------|----------|------|--------|------|
| 单元测试 | `npx vitest run` | 项目根 | passed | 0 | 3 文件 15 项全部通过 |
| 生产构建 | `npm run build` | 项目根 | passed | 0 | dist/ 产出 index.html + CSS + JS |
| 开发服务器 | `npm run dev` | 项目根 | passed | 0 | HTTP 200，URL: http://localhost:5174/ |

### 单元测试详情

- `tests/storage.test.js`（8 项）：createTeacher 持久化、updateTeacher 修改与不存在记录返回 null、deleteTeacher 移除、loadTeachers 空数据/无效 JSON/非数组返回空、saveTeachers 往返一致性
- `tests/fields.test.js`（6 项）：五字段必填定义、全部非空通过、空字符串失败、纯空格失败、全空失败并返回五项错误、createEmptyTeacher 结构
- `tests/crud-integration.test.js`（1 项）：完整 create → read → update → delete 周期

## 遗留风险

- 手机和邮箱格式校验未在需求中规定，当前基线不强制格式约束（与需求未规定事项一致）。
- 浏览器 E2E 验收（AC-01/AC-02/AC-03 的用户界面交互验证）留给 QA 阶段执行。
- 开发阶段不执行浏览器端到端验证，不声称交互验收已通过。

## QA 启动信息

- 启动命令：`npm run dev`
- 工作目录：项目根目录
- 前端地址：开发服务器启动后输出（默认 `http://localhost:5173`，端口被占用时自动递增）
- 无需登录，无服务端，数据存储于浏览器 `localStorage`
