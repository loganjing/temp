# Bug fix / 缺陷修复

Status / 状态: fixed

修复了教师管理系统中 4 个缺陷：(1) 删除确认弹窗在持久化失败时静默关闭且无错误反馈；(2) 表单校验通过后旧字段错误提示残留；(3) 用户修改字段时校验错误不清除；(4) 加载数据时未校验记录结构完整性。

## Investigation / 调查
- App.jsx handleDeleteConfirm 调用 persistTeachers 后未检查返回值，无论保存成功与否都执行 setDeleteTarget(null) 关闭删除确认弹窗
- persistTeachers 在保存失败时设置 formError 状态，但该状态仅在 TeacherForm 组件中渲染；删除时表单未打开，错误信息对用户不可见
- handleFormSubmit 在校验通过后未清空 formErrors，此前轮次的字段错误提示会残留显示
- handleFormChange 修改字段值时不清除该字段的校验错误，用户修正输入后错误提示仍持续显示直到下次提交
- loadTeachers 仅检查 localStorage 解析结果是否为数组，未校验单个教师对象的结构完整性，损坏数据可能导致 undefined 渲染和受控/非受控组件警告

## Root cause / 根因
handleDeleteConfirm 无条件关闭弹窗且不检查 persistTeachers 返回值；persistTeachers 将错误设置到仅表单可见的 formError 状态而非调用方上下文；handleFormSubmit 校验通过分支未重置 formErrors；handleFormChange 不清除对应字段错误；loadTeachers 缺少对单个教师对象的结构校验。

## Self-tests / 自测
- self-test-build: passed — 运行 npm run build 构建项目; vite v5.4.21 构建成功，36 个模块转换完成，输出 dist/index.html、dist/assets/index-*.css、dist/assets/index-*.js，退出码 0; 终端输出：✓ built in 219ms，36 modules transformed
- self-test-delete-persistence: passed — 代码审查 handleDeleteConfirm 是否检查 persistTeachers 返回值并在失败时保持弹窗打开; App.jsx 第 119-128 行：persistTeachers 返回 false 时设置 deleteError 且不调用 setDeleteTarget(null)；ConfirmDialog 接收 error prop 并在存在时渲染 form-error 提示; src/App.jsx:119-128, src/components/ConfirmDialog.jsx:3,9
- self-test-stale-errors: passed — 代码审查 handleFormSubmit 校验通过分支是否清空 formErrors; App.jsx 第 77 行在校验通过后立即执行 setFormErrors({})，确保后续保存流程中无残留错误; src/App.jsx:77
- self-test-field-error-clear: passed — 代码审查 handleFormChange 是否在字段值变更时清除该字段的校验错误; App.jsx 第 63-68 行在 setFormData 后通过 setFormErrors 回调删除对应字段的错误键，返回新对象; src/App.jsx:61-69
- self-test-data-validation: passed — 代码审查 loadTeachers 是否校验单个教师对象的结构完整性; storage.js 第 3-14 行定义 isValidTeacher 校验函数，第 22 行 loadTeachers 返回 parsed.filter(isValidTeacher) 过滤不合规记录; src/lib/storage.js:3-14,22
- self-test-persist-error-handling: passed — 代码审查 persistTeachers 是否将错误处理移至调用方上下文; App.jsx 第 30-37 行 persistTeachers 不再设置 formError；handleFormSubmit 第 94/105 行在失败时设置 formError；handleDeleteConfirm 第 126 行在失败时设置 deleteError; src/App.jsx:30-37,94,105,126

Independent QA remains required / 仍需独立 QA。
