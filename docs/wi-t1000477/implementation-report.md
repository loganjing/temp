# Bug fix / 缺陷修复

Status / 状态: fixed

修复保存教师 API 的三个问题：(1) 使用 safeTrim 函数替代直接 .trim() 调用，防止 undefined/null 字段导致 TypeError 崩溃；(2) 在 useTeachers hook 中新增 persistError 状态，持久化失败时向 UI 暴露错误信息，成功后自动清除；(3) 为 handleFormSubmit 添加 try-catch 错误处理，防止保存异常导致表单状态不一致。同时使 updateTeacher 返回更新后的教师对象，与 addTeacher 保持一致。

## Investigation / 调查
- useTeachers.js 的 addTeacher 和 updateTeacher 直接调用 data.name.trim()，若 data 字段为 undefined/null 会抛 TypeError 导致应用崩溃
- useTeachers.js 的 persist effect 在 localStorage.setItem 失败时仅 console.warn，用户无法感知保存失败，刷新后数据丢失
- updateTeacher 不返回任何值（返回 undefined），与 addTeacher 返回新建对象不一致
- App.jsx 的 handleFormSubmit 无 try-catch，若 addTeacher/updateTeacher 抛异常，表单不会关闭且错误直接传播到 React 错误边界

## Root cause / 根因
addTeacher 和 updateTeacher 假设 data 的所有字段都是字符串，直接调用 .trim() 而无防御性检查；持久化错误仅在控制台输出，未反馈给 UI；handleFormSubmit 无异常处理。根本原因是保存 API 缺乏防御性编程和错误反馈机制。

## Self-tests / 自测
- build: passed — 运行 npm run build 构建项目; vite build 成功，35 模块转换完成，产出 index.html + CSS + JS; dist/index.html (0.39 kB), dist/assets/index-PQtxzlM9.css (2.79 kB), dist/assets/index-DLT2AA86.js (148.29 kB)
- add-teacher: passed — 在浏览器中新增教师（张老师/数学/三年级/13800138000/zhang@test.com）; 教师显示在表格中，localStorage 包含正确的 JSON 数据; localStorage.getItem 返回 [{"id":"mvtdga7skjc403","name":"张老师","course":"数学",...}]
- edit-teacher: passed — 编辑教师将课程从数学改为物理并保存; 课程显示为物理，localStorage 中 course 字段为物理; localStorage 数据确认 course 从 "数学" 变为 "物理"
- persist-error-display: passed — 覆盖 localStorage.setItem 抛出异常后新增教师; 页面显示「数据保存失败：浏览器本地存储不可用或已满，刷新后数据可能丢失。」; snapshot 显示 persist-error div 包含错误文本
- persist-error-clear: passed — 恢复 localStorage.setItem 后再次新增教师; 错误提示消失，localStorage 包含全部 3 条教师记录; 页面文本不再包含错误提示，localStorage 包含 3 条记录

Independent QA remains required / 仍需独立 QA。
