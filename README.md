# 教师管理（142-teachers）

单页教师信息管理应用，支持教师记录的查看、新增、编辑、删除，字段包括教师名称、教授课程、年级、手机、邮箱。

## 技术形态

- React + Vite 单页应用（TypeScript）
- 数据保存在当前浏览器的 `localStorage`，键为 `teacher-management:teachers`
- 无服务端、无数据库、无认证

## 环境要求

- Node.js 18 及以上（开发环境已验证 Node.js v24）
- npm

## 安装

```bash
npm install
```

## 本地运行

```bash
npm run dev
```

Vite 开发服务器默认监听 `http://127.0.0.1:5199/`（端口被占用时自动改用下一个可用端口，以终端输出为准）。

## 校验与构建

```bash
npm run typecheck   # TypeScript 类型检查
npm run test        # 单元测试（vitest）
npm run build       # 类型检查 + 生产构建
```

## 目录结构

```text
src/
  main.tsx                     应用入口
  App.tsx                      页面状态与增删改查编排
  domain/teacher.ts            教师模型、字段口径、校验规则
  services/teacher-repository.ts  localStorage 读写与列表操作
  components/TeacherTable.tsx  教师列表与行操作
  components/TeacherForm.tsx   新增/编辑表单与字段级校验提示
  components/TeacherDetail.tsx 教师详情
  components/ConfirmDialog.tsx 删除确认
  styles/app.css               页面样式
```

## 使用说明

1. 点击列表右上角「新增教师」填写五个字段并保存，列表随即出现该记录。
2. 行内「查看」打开详情，「编辑」修改字段，「删除」经确认后移除记录。
3. 教师名称为必填；手机、邮箱需符合基本格式，不满足时保存会被阻止并提示对应字段。
4. 数据保存在本浏览器，刷新或重新打开页面后仍然保留。