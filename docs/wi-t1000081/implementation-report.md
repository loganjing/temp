# 教师管理系统实现报告

## 变更行为与实现依据

基于已批准的需求基线和架构基线，实现了一个单页教师管理系统（React + Vite），支持教师信息的增、删、改、查，数据持久化于浏览器 `localStorage`。

### 返工修改（revision 4）

根据评审反馈「请调整教师列表的字段展示」，对教师列表做以下调整：

1. **字段顺序调整**：将列顺序从「教师名称→教授课程→年级→手机→邮箱→操作」调整为「教师名称→年级→教授课程→手机→邮箱→操作」，使标识信息（名称、年级）更紧凑地排列在前。
2. **列宽与对齐优化**：引入 `table-layout: fixed` 配合 `<colgroup>` 精确控制各列宽度（教师名称 18%、年级 10%、教授课程 18%、手机 18%、邮箱 22%、操作 14%）；年级列和操作列居中对齐，其他列左对齐；长文本自动省略（`text-overflow: ellipsis`）避免撑乱表格。

### 实现依据

- 需求基线：`docs/wi-t1000081/requirements.md`
- 架构基线：`docs/wi-t1000081/architecture-baseline.md`（simple-frontend 路线，React + Vite + localStorage）

## 调用链与模块结构

```
index.html
└── src/main.jsx (React 挂载入口)
    └── src/App.jsx (页面状态管理：列表/表单切换)
        ├── src/components/TeacherList.jsx (教师列表表格 + 编辑/删除操作)
        ├── src/components/TeacherForm.jsx (新增/编辑表单 + 校验)
        ├── src/hooks/useTeachers.js (CRUD Hook + localStorage 读写)
        └── src/utils/validation.js (字段校验：名称必填、手机/邮箱轻量格式校验)
```

## 实现范围

### 教师字段

| 字段 | 必填 | 校验规则 |
|------|------|----------|
| 教师名称 | 是 | 非空（trim 后不为空） |
| 教授课程 | 否 | 无 |
| 年级 | 否 | 无 |
| 手机 | 否 | 填写时校验：11位数字以1开头 |
| 邮箱 | 否 | 填写时校验：常见邮箱格式 |

### 功能实现

1. **新增教师（AC-01）**：点击「新增教师」→ 表单填写 → 校验通过后写入 localStorage → 列表显示新记录。每条记录分配唯一 ID。
2. **编辑教师（AC-02）**：列表中点击「编辑」→ 表单预填当前值 → 修改后提交 → 记录更新，列表显示新值。
3. **删除教师（AC-03）**：列表中点击「删除」→ 确认对话框 → 从 localStorage 移除 → 列表移除该行。
4. **持久化**：数据存储于 `localStorage` 键 `teachers`，刷新或重开页面后保留。

### 生成文件清单

| 文件 | 用途 |
|------|------|
| `package.json` | 依赖与脚本 |
| `vite.config.js` | Vite + Vitest 配置 |
| `index.html` | HTML 入口 |
| `src/main.jsx` | React 挂载入口 |
| `src/App.jsx` | 主组件，列表/表单状态切换 |
| `src/components/TeacherList.jsx` | 教师列表表格组件 |
| `src/components/TeacherForm.jsx` | 教师表单组件 |
| `src/hooks/useTeachers.js` | CRUD Hook，localStorage 持久化 |
| `src/utils/validation.js` | 字段校验工具 |
| `src/styles/App.css` | 应用样式 |
| `tests/validation.test.js` | 校验逻辑单元测试（18 项） |
| `tests/useTeachers.test.js` | 存储逻辑单元测试（5 项） |

## 开发验证证据

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 |
|--------|------|----------|------|--------|
| 单元测试 | `npm run test` | 项目根 | 通过 | 0 |
| 生产构建 | `npm run build` | 项目根 | 通过 | 0 |
| 开发服务器 | `npm run dev` | 项目根 | 运行中 | — |

- 单元测试：23 项全部通过（validation 18 项 + storage 5 项）
- 构建产物：`dist/index.html`、`dist/assets/index-*.css`、`dist/assets/index-*.js`
- 前端预览地址：`http://localhost:5174/`
- 返工验证：字段顺序、列宽与对齐调整后重新运行测试与构建，均通过

## QA 交接说明

- 启动命令：`npm run dev`（工作目录为项目根）
- 前端地址：Vite 默认端口（5173，被占用时自动递增）
- 无需登录、无后端服务
- 数据存储于浏览器 localStorage，清除浏览器存储会丢失数据
- 验收范围：AC-01（新增并读回）、AC-02（编辑并读回）、AC-03（删除后列表移除）

## 遗留风险

- 无服务端、无跨设备同步（按需求「未规定事项」不纳入基线）
- 手机/邮箱校验为轻量格式校验，不保证号码/邮箱真实可用
- 浏览器 E2E 验收留给 QA 阶段
