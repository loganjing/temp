# 实现报告 — 教师管理系统

## 1. 变更行为与根因

本次实现基于已批准的需求基线（`docs/wi-t1000009/requirements.md`）和架构基线（`docs/wi-t1000009/architecture-baseline.md`），从零搭建一个 React + Vite SPA 教师管理系统，支持教师信息的增删改查，数据通过浏览器 `localStorage` 持久化。

根因：工作区此前无业务代码，需按精简前端路线新建完整应用。

## 2. 调用链

```
App.jsx (状态管理 + 路由)
  ├── src/lib/storage.js (localStorage 读写)
  ├── components/TeacherTable.jsx (列表展示 + 编辑/删除入口)
  ├── components/TeacherForm.jsx (新增/编辑表单)
  └── styles/index.css (样式)
```

## 3. 实现范围

### 3.1 项目脚手架

- `package.json` — React 18 + Vite 5 依赖声明
- `vite.config.js` — Vite 配置，React 插件
- `index.html` — SPA 入口
- `.gitignore` — 忽略 node_modules/dist
- `README.md` — 项目说明

### 3.2 数据层 (`src/lib/storage.js`)

- `loadTeachers()` — 从 `localStorage` 读取教师列表（键名 `teacher-mgmt:teachers`），JSON 解析，异常返回空数组
- `saveTeachers(teachers)` — 写入 `localStorage`
- `addTeacher(teacher)` — 生成 UUID 后追加并持久化
- `updateTeacher(id, updates)` — 按 ID 查找并合并更新后持久化
- `deleteTeacher(id)` — 按 ID 过滤删除后持久化

### 3.3 应用主组件 (`src/App.jsx`)

- 管理 `teachers` 列表状态，初始化时从 `localStorage` 加载
- 新增入口：打开表单弹窗，空白字段
- 编辑入口：预填充已有值到表单弹窗
- 表单提交：新增或更新教师后刷新列表
- 删除入口：弹出确认弹窗，确认后删除并刷新列表

### 3.4 教师列表 (`src/components/TeacherTable.jsx`)

- 表格展示全部五个字段：教师名称、教授课程、年级、手机、邮箱
- 每行提供编辑、删除操作按钮
- 空数据时显示提示文案

### 3.5 教师表单 (`src/components/TeacherForm.jsx`)

- 弹窗形式，包含五个字段输入控件
- 新增时空白，编辑时预填充
- 提交触发保存回调，取消关闭弹窗

### 3.6 样式 (`src/styles/index.css`)

- 紧凑、可扫描的专业布局
- 表格、弹窗、按钮、表单的统一样式

## 4. 验收条件映射

| AC | 描述 | 实现位置 | 开发自检 |
|----|------|----------|----------|
| AC-01 | 新增教师并读取到该记录 | `App.jsx` handleFormSubmit → `storage.js` addTeacher → refresh | 构建通过 |
| AC-02 | 查看教师列表展示五个字段 | `TeacherTable.jsx` COLUMNS 定义五列 | 构建通过 |
| AC-03 | 修改教师记录并读取到更新内容 | `App.jsx` handleEditClick/handleFormSubmit → `storage.js` updateTeacher → refresh | 构建通过 |
| AC-04 | 删除教师记录且不再可见 | `App.jsx` handleDeleteConfirm → `storage.js` deleteTeacher → refresh | 构建通过 |

## 5. 开发验证证据

### 5.1 构建检查

- 命令：`npm run build`
- 工作目录：项目根目录
- 状态：通过
- 退出码：0
- 证据：34 模块转换成功，输出 `dist/index.html`、`dist/assets/index-DabsARLT.css`、`dist/assets/index-D60wF2xC.js`

### 5.2 开发服务器

- 命令：`npm run dev`
- 前端预览地址：`http://localhost:5176/`
- 状态：运行中

## 6. 文件清单

| 文件 | 用途 |
|------|------|
| `package.json` | 依赖与脚本 |
| `vite.config.js` | Vite 配置 |
| `index.html` | SPA HTML 入口 |
| `.gitignore` | Git 忽略规则 |
| `README.md` | 项目说明 |
| `src/main.jsx` | React 入口 |
| `src/App.jsx` | 应用主组件 |
| `src/lib/storage.js` | localStorage 数据层 |
| `src/components/TeacherForm.jsx` | 新增/编辑表单组件 |
| `src/components/TeacherTable.jsx` | 教师列表表格组件 |
| `src/styles/index.css` | 全局样式 |

## 7. 遗留风险

- 浏览器交互闭环（新增/编辑/删除的端到端用户操作验证）留给 QA 阶段执行
- 字段格式校验（手机号位数、邮箱格式）需求未规定，未实现校验，不作为当前验收项
- localStorage 数据仅在当前浏览器配置文件中保留，不跨设备/浏览器同步（符合架构基线）
