# Bug fix / 缺陷修复

Status / 状态: fixed

Moved localStorage persistence out of setTeachers state updater functions into a dedicated useEffect that watches the teachers state. Added an initialized flag to prevent overwriting existing localStorage data before the initial load completes. The persist effect checks the return value and logs a warning on failure. Removed persist from useCallback dependency arrays since it is no longer called directly in the mutation callbacks.

## Investigation / 调查
- src/hooks/useTeachers.js: persist() is called inside setTeachers state updater functions in addTeacher, updateTeacher, and deleteTeacher. React state updater functions must be pure; calling persist (a side effect) inside them is an anti-pattern. In React 18 StrictMode (enabled in main.jsx), updaters are double-invoked, causing persist to run twice per operation.
- src/hooks/useTeachers.js: The return value of persist() is never checked by its callers. If localStorage.setItem fails (e.g., quota exceeded, security restrictions), the in-memory state updates but data is not persisted. The user experiences silent data loss on page reload with no error indication.
- All other source files (App.jsx, TeacherForm.jsx, DeleteConfirm.jsx, validation.js, main.jsx, index.html, vite.config.js, styles/index.css) were reviewed and found correct: imports match, validation logic is sound, CRUD event handlers use proper closure patterns, conditional rendering is correct, and CSS is consistent.

## Root cause / 根因
persist() was called inside setTeachers functional updaters in addTeacher, updateTeacher, and deleteTeacher, violating React's requirement that state updater functions be pure. Additionally, the return value of persist() (which indicates success/failure of localStorage.setItem) was never checked, meaning persistence failures were silently swallowed.

## Self-tests / 自测
- build-pass: passed — Run npm run build in the project directory; vite build completed: 35 modules transformed, dist/index.html (0.39 kB), dist/assets/index-CZBdn6gw.css (2.65 kB), dist/assets/index-DQ5u9y6W.js (147.90 kB); Build output: ✓ built in 228ms, no errors
- add-teacher-persists: passed — Add a new teacher with valid data and verify localStorage persistence; Added teacher 王五 (物理, 高三, 13700137000, wangwu@test.com). localStorage confirmed 2 records after add.; Browser eval: JSON.parse(localStorage.getItem('teacher-management:teachers')).length === 2
- edit-teacher-persists: passed — Edit an existing teacher's name and verify localStorage persistence; Edited teacher name from 测试 to 赵六. localStorage confirmed: JSON.parse(localStorage.getItem('teacher-management:teachers'))[0].name === '赵六'; Browser eval confirmed localStorage contains updated name
- delete-teacher-persists: passed — Delete a teacher via confirmation dialog and verify localStorage persistence; Deleted teacher 赵六. localStorage confirmed 1 record remaining (王五).; Browser eval: JSON.parse(localStorage.getItem('teacher-management:teachers')).length === 1
- reload-data-persists: passed — Reload the page after adding a teacher and verify data loads from localStorage; After reload, table shows 1 teacher (张三) with all fields intact.; Browser snapshot: cell '张三' visible in table after full page reload on port 5180
- validation-works: passed — Submit empty form, invalid phone, invalid email; Empty form: all 5 fields show '此字段为必填项'. Invalid phone '123456': shows '请输入有效的手机号码'. Invalid email 'invalid-email': shows '请输入有效的邮箱地址'.; Browser get text confirmed error messages displayed for each validation failure
- no-react-warnings: passed — Check browser console for React warnings on fresh page load; Fresh page load on port 5180 shows only Vite connection messages, React DevTools info, and Electron Security Warning (from preview browser). No React state updater warnings.; Browser console output on fresh load: no error-type messages from React
- persist-outside-updater: passed — Review source code to confirm persist is not called inside setTeachers updaters; src/hooks/useTeachers.js: persist is called in a dedicated useEffect (line ~42) that watches teachers state. addTeacher, updateTeacher, and deleteTeacher use pure setTeachers updaters with no side effects.; Source code review: no persist() calls inside setTeachers callbacks

Independent QA remains required / 仍需独立 QA。
