# 验证报告

## 验证结论

blocked

## 阻塞原因

environment-unavailable

AC-01 和 AC-02 的交付端为微信小程序，需微信开发者工具或真机环境运行。当前 QA 环境仅有浏览器，无法加载或操作小程序页面（miniprogram/pages/register、miniprogram/pages/my-visits）。后端 API 已验证登记持久化功能正常，但 Web 浏览器观察不能证明小程序端验收。需要微信开发者工具环境才能完成该项验收。

受影响检查: QA-01

后续动作: 恢复环境后正式重开 QA。

## 摘要

验证访客系统 k03-guest 的四个验收标准：访客小程序登记持久化（AC-01）、访客小程序状态查看（AC-02）、审批端移动审批操作（AC-03）、审批端移动端适配（AC-04）。

变更行为：审批端 SPA（React+Vite+antd-mobile）在移动端视口下完整实现待审核列表展示、访客详情查看、通过/拒绝审批操作，审核结果持久化到后端 SQLite 数据库。后端 API（Hono）正确处理登记提交、列表查询、详情查询、状态更新。

非目标：
- 访客端微信小程序 UI 验收（需微信开发者工具）
- 审批人身份认证与权限（需求标记为未规定）
- 微信手机号获取真实环境验证（需微信运行环境）

## 验证环境

本地开发环境 Node.js 22.23.4 / Vite 5.4.21 / Hono + better-sqlite3；隔离测试数据库 data/qa-test-visitors.db，通过 API 创建 2 条测试访客记录

## 验证检查

| 检查项 | 类型 | 状态 | 证据 |
|---|---|---|---|
| QA-01 | browser-ui | blocked | AC-01 和 AC-02 的交付端为微信小程序（miniprogram/pages/register 和 miniprogram/pages/my-visits）。微信小程序需要微信开发者工具或真机环境运行，无法在浏览器中加载或操作。QA 环境无微信开发者工具，浏览器无法证明小程序端验收。后端 API 已通过开发者冒烟测试验证登记持久化（POST /api/visitors → GET /api/visitors?phone= → status=pending），但 API 证据不能替代小程序 UI 验收。 |
| QA-02 | browser-ui | passed | 在移动端视口（375x812）下完成完整审批流程验证：打开审批系统→待审核列表显示访客卡片（人名、公司、访问事由、提交时间）→点击进入详情页显示完整访客信息→执行「通过」操作成功返回列表且该访客从待审核列表消失→后端 API 确认状态变为 approved。另创建第二位访客执行「拒绝」操作，同样成功返回空列表，后端确认状态变为 rejected。列表与详情在移动端布局可见且可操作，底部固定操作栏按钮可正常点击。<br>AC-03: 在移动端视口打开审批系统，待审核列表显示访客「张三」，点击进入详情页，点击「通过」按钮后返回列表，该访客从待审核列表消失。后端 GET /api/visitors/01M6QCF5RJ5R0K80731EAWG9HQ 确认 status=approved。 (passed)<br>AC-03: 审批列表页正确渲染访客卡片，显示人名、公司、访问事由、提交时间；详情页正确渲染完整访客信息（姓名、公司、手机号、身份证号、访问事由）和底部操作栏（通过/拒绝按钮）。 (passed)<br>AC-03: 审批操作后后端记录持久化更新：张三 status 从 pending 变为 approved（updated_at 2026-11-06T02:55:48.104Z）；李四 status 从 pending 变为 rejected（updated_at 2026-11-06T02:56:27.294Z），均通过 GET /api/visitors/{id} 读回确认。 (passed)<br>AC-04: 在移动端视口（375x812）下，列表卡片可浏览、可点击进入详情；详情页信息纵向排列可浏览；底部「通过」「拒绝」按钮可正常点击完成审批操作。另测试了「拒绝」流程同样成功。 (passed)<br>AC-04: 移动端视口下列表卡片单列排列布局正常；详情页文字可读、操作栏底部固定；通过/拒绝按钮视觉清晰可点击。空列表时显示「暂无待审核访客」空态文案。 (passed) |

## 验收覆盖

| 验收项 | 结果 | 证据 |
|---|---|---|
| AC-01 | not-verified | QA-01 |
| AC-02 | not-verified | QA-01 |
| AC-03 | met | QA-02 |
| AC-04 | met | QA-02 |

## 缺陷

- —

## 未执行项

- —

## 剩余风险

- 访客端微信小程序（AC-01、AC-02）未在浏览器中验证，需微信开发者工具环境完成小程序端 UI 验收
- 微信手机号获取功能（POST /api/wechat/phone）在无微信环境时返回 500，开发环境使用手工填写路径，真实微信环境未验证

<!-- structured-report:v1
{"decision":"blocked","summary":{"objective":"验证访客系统 k03-guest 的四个验收标准：访客小程序登记持久化（AC-01）、访客小程序状态查看（AC-02）、审批端移动审批操作（AC-03）、审批端移动端适配（AC-04）。","changedBehavior":"审批端 SPA（React+Vite+antd-mobile）在移动端视口下完整实现待审核列表展示、访客详情查看、通过/拒绝审批操作，审核结果持久化到后端 SQLite 数据库。后端 API（Hono）正确处理登记提交、列表查询、详情查询、状态更新。","nonGoals":["访客端微信小程序 UI 验收（需微信开发者工具）","审批人身份认证与权限（需求标记为未规定）","微信手机号获取真实环境验证（需微信运行环境）"],"riskLabels":["miniprogram-unverified","wechat-phone-unverified"]},"environment":{"name":"本地开发环境","version":"Node.js 22.23.4 / Vite 5.4.21 / Hono + better-sqlite3","dataProfile":"隔离测试数据库 data/qa-test-visitors.db，通过 API 创建 2 条测试访客记录"},"verification":[{"checkId":"QA-01","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-01","kind":"interaction","action":"访客在小程序登记页尝试从微信获取手机号（获取不到时手工填写手机号），填写身份证号、公司信息、人名、访问事由后提交登记。","expected":"提交成功；后端数据库可读回包含上述必填字段的完整登记记录；该记录状态为「待审核」。"},{"requirementId":"AC-01","kind":"runtime-render","action":"访客在小程序登记页尝试从微信获取手机号（获取不到时手工填写手机号），填写身份证号、公司信息、人名、访问事由后提交登记。","expected":"提交成功；后端数据库可读回包含上述必填字段的完整登记记录；该记录状态为「待审核」。"},{"requirementId":"AC-01","kind":"session-persistence","action":"访客在小程序登记页尝试从微信获取手机号（获取不到时手工填写手机号），填写身份证号、公司信息、人名、访问事由后提交登记。","expected":"提交成功；后端数据库可读回包含上述必填字段的完整登记记录；该记录状态为「待审核」。"},{"requirementId":"AC-02","kind":"interaction","action":"访客提交一条登记后，在小程序查看该登记的状态；随后该登记被审批人处理（通过或拒绝），访客再次查看状态。","expected":"首次查看状态为待审核；审批处理后，访客再次查看可见状态更新为通过或拒绝。"},{"requirementId":"AC-02","kind":"session-persistence","action":"访客提交一条登记后，在小程序查看该登记的状态；随后该登记被审批人处理（通过或拒绝），访客再次查看状态。","expected":"首次查看状态为待审核；审批处理后，访客再次查看可见状态更新为通过或拒绝。"}],"evidence":"AC-01 和 AC-02 的交付端为微信小程序（miniprogram/pages/register 和 miniprogram/pages/my-visits）。微信小程序需要微信开发者工具或真机环境运行，无法在浏览器中加载或操作。QA 环境无微信开发者工具，浏览器无法证明小程序端验收。后端 API 已通过开发者冒烟测试验证登记持久化（POST /api/visitors → GET /api/visitors?phone= → status=pending），但 API 证据不能替代小程序 UI 验收。"},{"checkId":"QA-02","type":"browser-ui","status":"passed","plan":[{"requirementId":"AC-03","kind":"interaction","action":"审批人在移动设备上打开审批系统，查看待审核列表，进入某条访客登记详情，执行通过（或拒绝）。","expected":"待审核列表中该访客登记消失或状态变更；后端记录该登记审核结果为通过（或拒绝）。"},{"requirementId":"AC-03","kind":"runtime-render","action":"审批人在移动设备上打开审批系统，查看待审核列表，进入某条访客登记详情，执行通过（或拒绝）。","expected":"待审核列表中该访客登记消失或状态变更；后端记录该登记审核结果为通过（或拒绝）。"},{"requirementId":"AC-03","kind":"session-persistence","action":"审批人在移动设备上打开审批系统，查看待审核列表，进入某条访客登记详情，执行通过（或拒绝）。","expected":"待审核列表中该访客登记消失或状态变更；后端记录该登记审核结果为通过（或拒绝）。"},{"requirementId":"AC-04","kind":"interaction","action":"在移动端设备（或移动端视口）打开审批系统，浏览待审核列表，进入详情并执行一次审核操作。","expected":"列表与详情在移动端可见且布局可操作；通过/拒绝操作可正常完成。"},{"requirementId":"AC-04","kind":"visual-style","action":"在移动端设备（或移动端视口）打开审批系统，浏览待审核列表，进入详情并执行一次审核操作。","expected":"列表与详情在移动端可见且布局可操作；通过/拒绝操作可正常完成。"}],"evidence":"在移动端视口（375x812）下完成完整审批流程验证：打开审批系统→待审核列表显示访客卡片（人名、公司、访问事由、提交时间）→点击进入详情页显示完整访客信息→执行「通过」操作成功返回列表且该访客从待审核列表消失→后端 API 确认状态变为 approved。另创建第二位访客执行「拒绝」操作，同样成功返回空列表，后端确认状态变为 rejected。列表与详情在移动端布局可见且可操作，底部固定操作栏按钮可正常点击。","testStrategy":{"traits":[],"mode":"direct","maxAttempts":2},"observation":{"method":"browser","actor":"expert","reference":"本轮浏览器验证：http://127.0.0.1:5173/ 移动端视口 375x812；后端 http://localhost:3000"},"assertions":[{"requirementId":"AC-03","kind":"interaction","action":"审批人在移动设备上打开审批系统，查看待审核列表，进入某条访客登记详情，执行通过（或拒绝）。","expected":"待审核列表中该访客登记消失或状态变更；后端记录该登记审核结果为通过（或拒绝）。","actual":"在移动端视口打开审批系统，待审核列表显示访客「张三」，点击进入详情页，点击「通过」按钮后返回列表，该访客从待审核列表消失。后端 GET /api/visitors/01M6QCF5RJ5R0K80731EAWG9HQ 确认 status=approved。","status":"passed"},{"requirementId":"AC-03","kind":"runtime-render","action":"审批人在移动设备上打开审批系统，查看待审核列表，进入某条访客登记详情，执行通过（或拒绝）。","expected":"待审核列表中该访客登记消失或状态变更；后端记录该登记审核结果为通过（或拒绝）。","actual":"审批列表页正确渲染访客卡片，显示人名、公司、访问事由、提交时间；详情页正确渲染完整访客信息（姓名、公司、手机号、身份证号、访问事由）和底部操作栏（通过/拒绝按钮）。","status":"passed"},{"requirementId":"AC-03","kind":"session-persistence","action":"审批人在移动设备上打开审批系统，查看待审核列表，进入某条访客登记详情，执行通过（或拒绝）。","expected":"待审核列表中该访客登记消失或状态变更；后端记录该登记审核结果为通过（或拒绝）。","actual":"审批操作后后端记录持久化更新：张三 status 从 pending 变为 approved（updated_at 2026-11-06T02:55:48.104Z）；李四 status 从 pending 变为 rejected（updated_at 2026-11-06T02:56:27.294Z），均通过 GET /api/visitors/{id} 读回确认。","status":"passed"},{"requirementId":"AC-04","kind":"interaction","action":"在移动端设备（或移动端视口）打开审批系统，浏览待审核列表，进入详情并执行一次审核操作。","expected":"列表与详情在移动端可见且布局可操作；通过/拒绝操作可正常完成。","actual":"在移动端视口（375x812）下，列表卡片可浏览、可点击进入详情；详情页信息纵向排列可浏览；底部「通过」「拒绝」按钮可正常点击完成审批操作。另测试了「拒绝」流程同样成功。","status":"passed"},{"requirementId":"AC-04","kind":"visual-style","action":"在移动端设备（或移动端视口）打开审批系统，浏览待审核列表，进入详情并执行一次审核操作。","expected":"列表与详情在移动端可见且布局可操作；通过/拒绝操作可正常完成。","actual":"移动端视口下列表卡片单列排列布局正常；详情页文字可读、操作栏底部固定；通过/拒绝按钮视觉清晰可点击。空列表时显示「暂无待审核访客」空态文案。","status":"passed"}]}],"coverage":{"acceptance":"AC-01: 访客在微信小程序登记页完成必填信息填写并提交，系统将登记信息持久化到后端数据库，登记记录可被读回且状态为待审核。; AC-02: 访客提交登记后，可在小程序中查看自己已提交登记的当前状态；当审批结果变化时，访客可见更新后的状态。; AC-03: 审批人在移动端审批系统查看待审核访客列表，查看访客登记详情，并对其执行通过或拒绝，审核结果写入后端。; AC-04: 审批系统的列表与详情页在移动端设备屏幕上可正常浏览、可点击操作（查看列表、查看详情、执行通过/拒绝）。","mandatoryAcceptance":[{"id":"AC-01","source":"requirements.md#AC-01","surface":"user-interface","status":"not-verified","checkIds":["QA-01"],"evidenceKinds":["interaction","runtime-render","session-persistence"],"evidence":"交付端为微信小程序，当前 QA 环境无微信开发者工具，无法通过浏览器验证小程序端登记与持久化。后端 API 已独立验证 POST /api/visitors 可持久化登记记录且状态为 pending，但 API 证据不能替代小程序 UI 验收。"},{"id":"AC-02","source":"requirements.md#AC-02","surface":"user-interface","status":"not-verified","checkIds":["QA-01"],"evidenceKinds":["interaction","session-persistence"],"evidence":"交付端为微信小程序，当前 QA 环境无微信开发者工具，无法通过浏览器验证小程序端状态查看。后端 GET /api/visitors?phone= 可查询记录状态，但 API 证据不能替代小程序 UI 验收。"},{"id":"AC-03","source":"requirements.md#AC-03","surface":"user-interface","status":"met","checkIds":["QA-02"],"evidenceKinds":["interaction","runtime-render","session-persistence"],"evidence":"QA-02 通过：审批端列表→详情→通过/拒绝完整流程验证，审核结果写入后端并读回确认。"},{"id":"AC-04","source":"requirements.md#AC-04","surface":"user-interface","status":"met","checkIds":["QA-02"],"evidenceKinds":["interaction","visual-style"],"evidence":"QA-02 通过：移动端视口（375x812）下列表与详情布局可见可操作，通过/拒绝按钮可正常完成。"}],"riskLabels":[],"verificationTypes":["browser-ui"]},"defects":[],"skippedChecks":[],"residualRisks":["访客端微信小程序（AC-01、AC-02）未在浏览器中验证，需微信开发者工具环境完成小程序端 UI 验收","微信手机号获取功能（POST /api/wechat/phone）在无微信环境时返回 500，开发环境使用手工填写路径，真实微信环境未验证"],"baselineUpdates":[],"testStrategyVersion":1,"blockedReason":{"code":"environment-unavailable","details":"AC-01 和 AC-02 的交付端为微信小程序，需微信开发者工具或真机环境运行。当前 QA 环境仅有浏览器，无法加载或操作小程序页面（miniprogram/pages/register、miniprogram/pages/my-visits）。后端 API 已验证登记持久化功能正常，但 Web 浏览器观察不能证明小程序端验收。需要微信开发者工具环境才能完成该项验收。","checkIds":["QA-01"]}}
-->
