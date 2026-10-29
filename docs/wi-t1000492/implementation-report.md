# Bug fix / 缺陷修复

Status / 状态: fixed

在 useTeachers hook 的返回值中暴露 initialized 状态；在 App.jsx 中使用 initialized 判断，未加载完成时显示'正在加载教师数据…'，加载完成后再判断是否有数据。

## Investigation / 调查
- useTeachers hook 是本应用的教师查询 API：它在 useEffect 中从 localStorage 异步加载数据并返回 teachers 数组。
- hook 内部维护 initialized 状态标记 localStorage 数据是否加载完成，但该状态未在 return 中暴露给调用方。
- App.jsx 通过 teachers.length === 0 判断是否显示'暂无教师记录'，无法区分'数据正在加载'和'确实无数据'两种情况。
- 首次渲染时 teachers 初始值为 []（空数组），useEffect 尚未执行，UI 立即渲染'暂无教师记录'，造成闪空现象。
- 数据从 localStorage 加载完成后重新渲染，教师列表才出现——这是查询 API 未暴露加载状态的缺陷。

## Root cause / 根因
useTeachers hook 内部维护了 initialized 状态标记 localStorage 数据是否加载完成，但未在返回值中暴露。App.jsx 只能通过 teachers.length === 0 判断是否无数据，无法区分'正在加载'和'确实无数据'，导致首次渲染时闪空显示'暂无教师记录'。

## Self-tests / 自测
- build-check: passed — 运行 npm run build 构建项目; vite build 成功，输出 dist/index.html、dist/assets/index-Ce2H_sIY.js、dist/assets/index-PQtxzlM9.css; vite build 输出: ✓ 35 modules transformed, ✓ built in 263ms
- dev-server-check: passed — 启动开发服务器并访问 http://localhost:5180; 页面成功加载，标题为'教师管理系统'; agent_browser snapshot 确认页面加载成功
- add-teacher-check: passed — 点击'新增教师'按钮，填写表单数据（张老师/数学/高三/13800138000/zhang@example.com）并提交; 表单提交成功，表格中显示张老师的完整记录; agent_browser snapshot 确认表格中出现张老师/数学/高三/13800138000/zhang@example.com
- query-reload-check: passed — 刷新页面（http://localhost:5180），验证教师数据从 localStorage 重新加载; 刷新后教师数据正确加载并显示，initialized 状态确保加载完成前显示'正在加载教师数据…'而非'暂无教师记录'; agent_browser snapshot 确认刷新后张老师数据正确显示在表格中
- empty-state-check: passed — 在无数据状态下检查空状态显示; 代码逻辑确认：!initialized 时显示加载提示，initialized && teachers.length===0 时显示空数据提示; src/App.jsx 第 91-102 行：{!initialized ? (...正在加载...) : teachers.length === 0 ? (...暂无教师记录...) : (...教师列表...)}

Independent QA remains required / 仍需独立 QA。
