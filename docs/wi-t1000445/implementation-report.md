# Bug fix / 缺陷修复

Status / 状态: fixed

Fixed 4 bugs: (1) removed .col-actions class from <th> and wrapped action buttons in a <div> inside <td> to preserve table-cell layout; (2) added Escape key handler to TeacherForm modal; (3) added Escape key handler to ConfirmDialog; (4) wrapped localStorage.setItem in try-catch with boolean return and updated all callers to check write result.

## Investigation / 调查
- TeacherList.jsx: CSS class .col-actions (display:flex; gap:8px) was applied directly to both <th> and <td> elements, overriding display:table-cell and breaking table header and cell layout.
- TeacherForm.jsx: Modal dialog had no keyboard Escape handler; users could only close via cancel button or overlay click, violating standard modal UX expectations.
- ConfirmDialog.jsx: Same missing Escape key handler; delete confirmation dialog could not be dismissed with Escape.
- storage.js: persist() called localStorage.setItem without try-catch; quota-exceeded or privacy-mode exceptions would propagate unhandled and crash the app. saveTeacher/updateTeacher/deleteTeacher did not check write results before returning success.
- Browser runtime verification was attempted (dev server started at http://localhost:5173) but the preview browser did not respond within 30s timeout; runtime verification could not be completed in this environment and is recommended as a follow-up.

## Root cause / 根因
1. .col-actions CSS class with display:flex was applied to <th> and <td> elements directly, overriding display:table-cell and breaking table layout. 2. Modal components lacked keyboard event listeners for Escape. 3. persist() had no error handling for localStorage write failures, and calling functions assumed writes always succeeded.

## Self-tests / 自测
- build-check: passed — Run npm run build after all fixes applied; Build completed successfully: 36 modules transformed, output generated to dist/; vite build output: ✓ built in 206ms, dist/index-BiRPYQy4.js 148.45 kB
- col-actions-fix: passed — Review TeacherList.jsx: verify .col-actions class is removed from <th> and action buttons are wrapped in <div className='col-actions'> inside <td>; Line 26: <th>操作</th> (no col-actions class); Lines 37-52: <td><div className='col-actions'>...</div></td>; TeacherList.jsx source verified after edit
- escape-form: passed — Review TeacherForm.jsx: verify useEffect adds keydown listener for Escape that calls onCancel; Lines 22-31: useEffect with handleKeyDown checking e.key === 'Escape' calling onCancel, with proper cleanup; TeacherForm.jsx source verified after edit
- escape-dialog: passed — Review ConfirmDialog.jsx: verify useEffect adds keydown listener for Escape that calls onCancel; Lines 7-16: useEffect with handleKeyDown checking e.key === 'Escape' calling onCancel, with proper cleanup; ConfirmDialog.jsx source verified after edit
- persist-error: passed — Review storage.js: verify persist() wraps localStorage.setItem in try-catch returning boolean, and saveTeacher/updateTeacher/deleteTeacher check the result; Lines 78-85: persist() in try-catch returning true/false; Line 36: saveTeacher checks !persist(); Line 51: updateTeacher checks !persist(); Line 64: deleteTeacher checks !persist(); storage.js source verified after edit

Independent QA remains required / 仍需独立 QA。
