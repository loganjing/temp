# 验证报告

## 验证结论

fail

## 摘要

验证番茄钟专注倒计时完成→自动记录当日列表→累计时长更新→热力图渲染

变更行为：React+Vite 单页面番茄钟系统，25 分钟专注+5 分钟休息循环，localStorage 持久化当日记录

非目标：
- 跨天持久化
- 暂停/重置/跳过
- 声音/弹窗提醒

## 验证环境

Vite dev server (React 18 StrictMode) Vite 5.4.21, React 18；清除 localStorage 后使用加速时钟（setInterval 10ms）完成 1 次专注倒计时

## 验证检查

| 检查项 | 类型 | 状态 | 证据 |
|---|---|---|---|
| QA-01 | browser-ui | failed | 清除 localStorage 后用加速时钟（setInterval 10ms）完成 1 次专注倒计时。专注阶段 25:00→00:00 完成后自动切换到休息阶段（显示「休息中」）。但当日列表记录了 2 条会话（localStorage 中 completedAt 分别为 1792995985327 和 1792995985328，相差 1ms），而非预期的 1 条。根因：usePomodoro.js:35 在 setSecondsLeft updater 函数内调用 saveSession()，React 18 StrictMode 开发模式双重调用 updater 导致重复写入 localStorage。<br>AC-01: 专注阶段完成后自动切换到休息阶段（休息中），但当日列表新增 2 条记录而非 1 条 (failed)<br>AC-01: 同上：专注完成后进入休息阶段，当日列表新增 2 条记录（应为 1 条），含完成时间 14:26 和专注时长 25 分钟 (failed) |
| QA-02 | browser-ui | failed | 完成 1 次专注倒计时后，页面上方累计专注时长显示「50 分钟」「已完成 2 个番茄钟」，而非预期的「25 分钟」「1 个番茄钟」。根因同 QA-01：StrictMode 双重调用 saveSession 导致 sessions 数量翻倍，累计时长 = sessions.length × 25 = 2 × 25 = 50。<br>AC-02: 完成 1 次专注后累计显示 50 分钟（应为 25 分钟），2 个番茄钟（应为 1 个） (failed) |
| QA-03 | browser-ui | passed | 热力图按 24 小时分桶渲染。完成专注后对应小时格子（14 时）显示 active 状态，背景色 rgb(107,74,42)（热度色），与未专注时段 rgb(30,34,48) 存在可辨识差异。热力图分桶与颜色深浅渲染机制正确。注：因 DEFECT-001 导致该格子显示 50 分钟而非 25 分钟，但热力图的分桶映射与颜色深浅渲染行为本身符合验收要求。<br>AC-03: 热力图存在与完成专注对应的小时分桶（14 时），颜色深浅反映专注强度，与空时段可辨识 (passed)<br>AC-03: active 格子背景 rgb(107,74,42) vs inactive rgb(30,34,48)，视觉差异可辨识 (passed) |

## 验收覆盖

| 验收项 | 结果 | 证据 |
|---|---|---|
| AC-01 | not-met | QA-01 |
| AC-02 | not-met | QA-02 |
| AC-03 | met | QA-03 |

## 缺陷

- DEFECT-001 (blocking, wi-t1000046): saveSession() 在 setSecondsLeft updater 函数内调用（usePomodoro.js:35），React 18 StrictMode 开发模式双重调用 updater 导致副作用执行两次; 预期: 当日列表新增 1 条专注记录; 实际: 当日列表新增 2 条专注记录（时间戳相差 1ms），累计专注时长翻倍; 要求修改: 将 saveSession 调用移出 setSecondsLeft updater 函数，改用 useEffect 监听专注完成条件后执行副作用，或在 updater 外预计算会话数据; 复现步骤: 清除 localStorage，加载 http://127.0.0.1:5173/ → 覆盖 setInterval 为 10ms 加速倒计时 → 点击「开始专注」，等待专注阶段倒计时结束

## 未执行项

- —

## 剩余风险

- StrictMode 双重调用仅在开发模式生效；生产构建（npm run build）不受影响，但未对生产构建做运行时验证

<!-- structured-report:v1
{"decision":"fail","summary":{"objective":"验证番茄钟专注倒计时完成→自动记录当日列表→累计时长更新→热力图渲染","changedBehavior":"React+Vite 单页面番茄钟系统，25 分钟专注+5 分钟休息循环，localStorage 持久化当日记录","nonGoals":["跨天持久化","暂停/重置/跳过","声音/弹窗提醒"],"riskLabels":["dev-only-strictmode-duplication"]},"environment":{"name":"Vite dev server (React 18 StrictMode)","version":"Vite 5.4.21, React 18","dataProfile":"清除 localStorage 后使用加速时钟（setInterval 10ms）完成 1 次专注倒计时"},"verification":[{"checkId":"QA-01","type":"browser-ui","status":"failed","plan":[{"requirementId":"AC-01","kind":"interaction","action":"启动番茄钟，使专注阶段倒计时运行至结束（可用可控/加速时钟驱动渲染以避免长时间等待）。","expected":"专注阶段结束后，当日列表新增一条专注时段记录（含完成时间、专注时长 25 分钟）；倒计时切换到 05:00 休息阶段。"},{"requirementId":"AC-01","kind":"runtime-render","action":"启动番茄钟，使专注阶段倒计时运行至结束（可用可控/加速时钟驱动渲染以避免长时间等待）。","expected":"专注阶段结束后，当日列表新增一条专注时段记录（含完成时间、专注时长 25 分钟）；倒计时切换到 05:00 休息阶段。"}],"evidence":"清除 localStorage 后用加速时钟（setInterval 10ms）完成 1 次专注倒计时。专注阶段 25:00→00:00 完成后自动切换到休息阶段（显示「休息中」）。但当日列表记录了 2 条会话（localStorage 中 completedAt 分别为 1792995985327 和 1792995985328，相差 1ms），而非预期的 1 条。根因：usePomodoro.js:35 在 setSecondsLeft updater 函数内调用 saveSession()，React 18 StrictMode 开发模式双重调用 updater 导致重复写入 localStorage。","observation":{"method":"browser","actor":"expert","reference":"http://127.0.0.1:5173/ 本轮浏览器验证；localStorage 清除后完成 1 次专注倒计时"},"assertions":[{"requirementId":"AC-01","kind":"interaction","action":"启动番茄钟，使专注阶段倒计时运行至结束（可用可控/加速时钟驱动渲染以避免长时间等待）。","expected":"专注阶段结束后，当日列表新增一条专注时段记录（含完成时间、专注时长 25 分钟）；倒计时切换到 05:00 休息阶段。","actual":"专注阶段完成后自动切换到休息阶段（休息中），但当日列表新增 2 条记录而非 1 条","status":"failed"},{"requirementId":"AC-01","kind":"runtime-render","action":"启动番茄钟，使专注阶段倒计时运行至结束（可用可控/加速时钟驱动渲染以避免长时间等待）。","expected":"专注阶段结束后，当日列表新增一条专注时段记录（含完成时间、专注时长 25 分钟）；倒计时切换到 05:00 休息阶段。","actual":"同上：专注完成后进入休息阶段，当日列表新增 2 条记录（应为 1 条），含完成时间 14:26 和专注时长 25 分钟","status":"failed"}]},{"checkId":"QA-02","type":"browser-ui","status":"failed","plan":[{"requirementId":"AC-02","kind":"runtime-render","action":"在已完成 N 个番茄钟的状态下查看页面上方的累计专注时长。","expected":"累计专注时长 = N × 25 分钟；完成新增番茄钟后该值立即更新为 (N+1) × 25 分钟。"}],"evidence":"完成 1 次专注倒计时后，页面上方累计专注时长显示「50 分钟」「已完成 2 个番茄钟」，而非预期的「25 分钟」「1 个番茄钟」。根因同 QA-01：StrictMode 双重调用 saveSession 导致 sessions 数量翻倍，累计时长 = sessions.length × 25 = 2 × 25 = 50。","observation":{"method":"browser","actor":"expert","reference":"http://127.0.0.1:5173/ 累计区显示 50 分钟 / 已完成 2 个番茄钟"},"assertions":[{"requirementId":"AC-02","kind":"runtime-render","action":"在已完成 N 个番茄钟的状态下查看页面上方的累计专注时长。","expected":"累计专注时长 = N × 25 分钟；完成新增番茄钟后该值立即更新为 (N+1) × 25 分钟。","actual":"完成 1 次专注后累计显示 50 分钟（应为 25 分钟），2 个番茄钟（应为 1 个）","status":"failed"}]},{"checkId":"QA-03","type":"browser-ui","status":"passed","plan":[{"requirementId":"AC-03","kind":"runtime-render","action":"完成若干番茄钟后查看页面下方热力图。","expected":"热力图存在与完成番茄钟对应的时段分桶，且这些分桶的颜色深浅反映专注强度，与未发生专注的时段存在可辨识差异。"},{"requirementId":"AC-03","kind":"visual-style","action":"完成若干番茄钟后查看页面下方热力图。","expected":"热力图存在与完成番茄钟对应的时段分桶，且这些分桶的颜色深浅反映专注强度，与未发生专注的时段存在可辨识差异。"}],"evidence":"热力图按 24 小时分桶渲染。完成专注后对应小时格子（14 时）显示 active 状态，背景色 rgb(107,74,42)（热度色），与未专注时段 rgb(30,34,48) 存在可辨识差异。热力图分桶与颜色深浅渲染机制正确。注：因 DEFECT-001 导致该格子显示 50 分钟而非 25 分钟，但热力图的分桶映射与颜色深浅渲染行为本身符合验收要求。","observation":{"method":"browser","actor":"expert","reference":"http://127.0.0.1:5173/ 热力图区，14 时格子 active（rgb(107,74,42)），其余 inactive（rgb(30,34,48)）"},"assertions":[{"requirementId":"AC-03","kind":"runtime-render","action":"完成若干番茄钟后查看页面下方热力图。","expected":"热力图存在与完成番茄钟对应的时段分桶，且这些分桶的颜色深浅反映专注强度，与未发生专注的时段存在可辨识差异。","actual":"热力图存在与完成专注对应的小时分桶（14 时），颜色深浅反映专注强度，与空时段可辨识","status":"passed"},{"requirementId":"AC-03","kind":"visual-style","action":"完成若干番茄钟后查看页面下方热力图。","expected":"热力图存在与完成番茄钟对应的时段分桶，且这些分桶的颜色深浅反映专注强度，与未发生专注的时段存在可辨识差异。","actual":"active 格子背景 rgb(107,74,42) vs inactive rgb(30,34,48)，视觉差异可辨识","status":"passed"}]}],"coverage":{"acceptance":"AC-01: 一个专注阶段从 25:00 倒计时完成时，系统自动把该专注时段记入当日列表，随后进入 5 分钟休息阶段。; AC-02: 页面上方展示当日累计专注时长，每完成一个番茄钟后累计值递增。; AC-03: 页面下方热力图按当日时间区间分桶展示专注强度，完成番茄钟后对应时段颜色更新。","mandatoryAcceptance":[{"id":"AC-01","source":"requirements.md#AC-01","surface":"user-interface","status":"not-met","checkIds":["QA-01"],"evidenceKinds":["interaction","runtime-render"],"evidence":"QA-01 failed：每次专注完成记录 2 条会话而非 1 条，DEFECT-001"},{"id":"AC-02","source":"requirements.md#AC-02","surface":"user-interface","status":"not-met","checkIds":["QA-02"],"evidenceKinds":["runtime-render"],"evidence":"QA-02 failed：1 次专注后显示 50 分钟而非 25 分钟，DEFECT-001"},{"id":"AC-03","source":"requirements.md#AC-03","surface":"user-interface","status":"met","checkIds":["QA-03"],"evidenceKinds":["runtime-render","visual-style"],"evidence":"QA-03 passed：热力图分桶与颜色渲染正确（数据值受 DEFECT-001 影响）"}],"riskLabels":[],"verificationTypes":["browser-ui"]},"defects":[{"id":"DEFECT-001","taskId":"wi-t1000046","severity":"blocking","environment":"dev (Vite dev server, React 18 StrictMode)","steps":["清除 localStorage，加载 http://127.0.0.1:5173/","覆盖 setInterval 为 10ms 加速倒计时","点击「开始专注」，等待专注阶段倒计时结束"],"expected":"当日列表新增 1 条专注记录","actual":"当日列表新增 2 条专注记录（时间戳相差 1ms），累计专注时长翻倍","problem":"saveSession() 在 setSecondsLeft updater 函数内调用（usePomodoro.js:35），React 18 StrictMode 开发模式双重调用 updater 导致副作用执行两次","requiredChange":"将 saveSession 调用移出 setSecondsLeft updater 函数，改用 useEffect 监听专注完成条件后执行副作用，或在 updater 外预计算会话数据","acceptanceEvidence":"待修复后复验"}],"skippedChecks":[],"residualRisks":["StrictMode 双重调用仅在开发模式生效；生产构建（npm run build）不受影响，但未对生产构建做运行时验证"],"baselineUpdates":[]}
-->
