# 教师管理系统（k01-teacher）

教师记录管理单页应用：教师名称、教授课程、年级、手机、邮箱的新增、查看、编辑与删除。数据保存在浏览器本地存储，同一浏览器刷新或重新打开后仍可读回。

## 运行

```bash
npm install
npm run dev      # 开发预览，默认 http://127.0.0.1:5173
npm run build    # 生产构建，产物在 dist/
npm run test     # 单元测试（数据模块与字段校验）
```

## 结构

- `index.html`、`vite.config.js`：Vite 入口与配置
- `src/main.jsx`：应用挂载
- `src/App.jsx`：教师管理页面（清单、新增、编辑、删除确认）
- `src/components/TeacherFormDrawer.jsx`：新增/编辑共用的教师表单，课程与年级为可增删的条目列表
- `src/lib/teacherStore.js`：本地存储读写（键 `k01-teacher:teachers:v1`），唯一的数据访问入口
- `src/lib/teacherValidation.js`：名称必填、手机与邮箱格式校验
- `src/styles.css`：工作台视觉样式
- `tests/`：数据模块与校验规则单元测试

## 数据边界

- 无服务端、无数据库、无登录；记录只存储在当前浏览器，不跨设备或跨浏览器同步。
- 单条记录结构：`id`、`name`、`courses`（字符串数组）、`grades`（字符串数组）、`mobile`、`email`。
- 写入前去除首尾空白并丢弃空的多值条目；编辑按 `id` 原地更新，删除按 `id` 移除。
- 首次访问无数据时以空清单启动，不预置演示数据。