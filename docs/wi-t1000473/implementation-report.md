# Bug fix / 缺陷修复

Status / 状态: fixed

修复三个问题：(1) useTeachers.js 使用 useState 惰性初始化同步读取 localStorage，消除页面加载时空列表闪现；移除了不再需要的 initialized 状态和初始化 useEffect。(2) TeacherForm.jsx 使用 useState 惰性初始化同步回填编辑数据，消除编辑模式空表单闪现。(3) CSS 为 tbody td 添加 overflow-wrap: break-word 和 word-break: break-word，防止超长文本被裁剪。

## Investigation / 调查
- useTeachers.js: teachers 状态初始化为空数组 []，通过 useEffect 异步从 localStorage 加载数据。首帧渲染时 teachers 为空，表格显示「暂无教师记录」，effect 执行后才更新为持久化数据，导致页面加载时短暂闪现空列表。
- TeacherForm.jsx: formData 状态初始化为 EMPTY_FORM，通过 useEffect 异步回填编辑数据。编辑模式打开表单时首帧渲染为空字段，effect 执行后才填入教师数据，导致编辑表单打开时短暂闪现空表单。
- styles/index.css: .table-wrapper 设置 overflow: hidden（用于 border-radius 裁剪），但 tbody td 缺少 overflow-wrap/word-break，当单元格内容为超长无空格文本（如很长的邮箱地址）时，内容会被裁剪不可见。

## Root cause / 根因
useTeachers.js 和 TeacherForm.jsx 均使用 useState(初始值) + useEffect 异步加载模式，导致首帧渲染时数据未就绪、出现短暂的空状态闪现。正确做法是使用 useState(() => ...) 惰性初始化在首次渲染时同步完成数据加载。CSS 中 .table-wrapper 的 overflow: hidden 用于配合 border-radius，但未给单元格设置换行规则，超长无空格文本溢出后被裁剪。

## Self-tests / 自测
- build: passed — 运行 npm run build; vite build 成功，35 模块转换完成，产出 index.html / CSS 2.70KB / JS 147.96KB; 终端输出: ✓ built in 231ms，无 error
- no-flash-on-load: passed — 在有 localStorage 持久化数据的情况下刷新页面; 刷新后页面直接显示已持久化的教师列表，无空列表闪现; 浏览器全量刷新后 snapshot 立即显示教师数据行，无空状态过渡
- no-flash-on-edit: passed — 点击教师行的编辑按钮打开编辑表单; 编辑表单打开瞬间字段已填入教师数据（王老师/英语/五年级/13900139000/wang@example.com），无空表单闪现; snapshot 显示编辑表单 ref e98-e102 均已包含教师数据
- add-teacher: passed — 点击新增教师，填写有效数据并提交; 添加赵老师（物理/初一/13500135000/zhao@example.com）成功，表格显示新行; snapshot 显示新教师行 ref e139-e144
- edit-teacher: passed — 编辑教师信息并保存; 将王老师编辑为王老师改/数学并保存成功，表格显示更新后的数据; snapshot 显示 cell 王老师改 / 数学
- delete-teacher: passed — 点击删除并确认; 删除赵老师成功，表格中该行消失，剩余教师正常显示; snapshot 确认赵老师行已移除，王老师改和李老师仍在
- validation-empty: passed — 空表单点击提交; 所有字段显示「此字段为必填项」，表单保持打开; get text 显示五个字段均出现错误信息
- validation-format: passed — 输入无效手机号 123456 和无效邮箱 invalid-email 并提交; 手机显示「请输入有效的手机号码」，邮箱显示「请输入有效的邮箱地址」; get text 确认错误信息内容
- validation-realtime: passed — 输入无效手机号并失焦，再修正为有效手机号; 失焦显示手机号格式错误，输入有效号码后错误实时消失; 两次 get text 对比确认错误出现后消失
- persistence: passed — 添加教师后刷新页面; 刷新后教师数据正确持久化并显示; 刷新后 snapshot 显示教师列表完整保留
- trimming: passed — 输入带首尾空格的教师姓名并保存; 输入「  李老师  」，表格显示「李老师」（已去除空格）; snapshot cell 显示李老师（无空格）
- no-console-errors: passed — 全量刷新页面后检查控制台; 全量刷新后控制台仅有 vite 连接和 React DevTools 信息，无运行时错误; console 输出无 error 级别消息（HMR 过渡期间的 hooks 顺序警告仅出现在热替换时，全量刷新后不出现）

Independent QA remains required / 仍需独立 QA。
