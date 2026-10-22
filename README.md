# 教师管理系统

基于 React + Vite 的教师管理 SPA，支持教师的增删改查，数据通过浏览器 localStorage 持久化。

## 功能

- 新增教师（教师名称、教授课程、年级、手机、邮箱）
- 查看教师列表（表格展示全部五个字段）
- 编辑教师信息
- 删除教师记录（含确认）

## 运行

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

## 技术栈

- React 18
- Vite 5
- localStorage 持久化（键名 `teacher-mgmt:teachers`）
