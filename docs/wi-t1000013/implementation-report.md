# Bug fix / 缺陷修复

Status / 状态: fixed

修复三处缺陷：工作台按优先级排序的方向与「P0 最高」相反；演示数据中完成通知日志早于完成日志；工单详情日志区在加载中显示「暂无操作日志」。

## Investigation / 调查
- 本项目源码由任务指定的交付工作树（wi-t1000009，分支 kteam/23685154673270784/T1000009）导入当前工作区后开展排查；工作区初始仅含 docs 与本地台账。
- 工单工作台按优先级排序时，默认方向的「降序」把最低优先级排在最前：修复前 desc 返回 TK-900003(P3) 在首位、TK-900002(P1) 在末位，与「P0 为最高优先级」的业务约定相反。
- 演示数据的已完成工单里，「发送完成通知」与「完成工单」写入同一时间戳，操作日志按时间正序展示时通知排在完成之前，动作时序错乱。
- 工单详情首次打开时，操作日志请求尚未返回，日志卡片先渲染「暂无操作日志」，与随后出现的 6 条日志矛盾，容易被误读为日志丢失。
- 公司隔离、状态流转、通知重试、统计口径等其余行为与既有契约一致，本轮未发现其它确定性缺陷。

## Root cause / 根因
① listTickets 把优先级映射为 P0=0…P4=4 的序位后直接套用通用的 asc/desc 方向，导致 order=desc（默认）时数值最大者（P4/P3）在前，与业务语义相反；② 演示种子把完成通知的时间偏移量设为与完成动作相同，日志按时间正序排序时以随机 id 兜底，通知先出；③ TicketDetail 只有 logs/ logsFailed 两个状态，未区分日志是否仍在加载，空数组同时代表「加载中」与「确实为空」。

## Self-tests / 自测
- ST-01-priority-desc: passed — GET /api/tickets?scope=workbench&status=all&sort=priority&order=desc; 返回 TK-900002:P1, TK-900001:P2, TK-900004:P2, TK-900005:P2, TK-900003:P3; 修复后对临时服务复测：admin sort priority desc -> [TK-900002:P1 … TK-900003:P3]；修复前同请求为 [TK-900003:P3 … TK-900002:P1]
- ST-02-priority-default: passed — GET /api/tickets?scope=workbench&status=all&sort=priority（省略 order）; 返回 TK-900002:P1 在首位; test/ticket-api.test.mjs 与 test/ticket-service.test.mjs 新增 sortedDefault 断言，npm test 通过
- ST-03-priority-asc: passed — GET /api/tickets?scope=workbench&status=all&sort=priority&order=asc; 返回 TK-900003:P3, TK-900001:P2, TK-900004:P2, TK-900005:P2, TK-900002:P1; curl 复测输出；对应测试断言已更新并通过
- ST-04-seed-log-order: passed — GET /api/tickets/seed-ticket-acme-5/logs 与 /tickets/seed-ticket-acme-5 浏览器查看操作日志; 接口返回 created → replied → completed → notified → rated；页面日志卡片第 3 条为「完成工单」、第 4 条为「发送完成通知」; verify3 复测输出；浏览器 eval 读取第 3/4 条 timeline 文本；test/ticket-api.test.mjs 新增完成早于通知的断言
- ST-05-log-loading-state: passed — 在日志接口延迟 1.2s 的条件下打开 /tickets/seed-ticket-acme-5，读取日志卡片状态; 请求中日志卡片内 1 个骨架屏、0 条日志、页面无「暂无操作日志」文案；请求返回后骨架屏消失、显示 6 条日志; 浏览器 eval：{skeleton:1, logItems:0, empty:false} → 等待后 {skeleton:0, logItems:6}
- ST-06-project-checks: passed — npm test 与 npm run build（服务端/客户端类型检查 + 前端构建）; npm test：12 个测试文件，11 pass、0 fail、1 skip（platform.test.mjs 因已配置鉴权边界按条件跳过）；npm run build：tsc server/client 通过，vite build 成功产出 dist; 本机命令输出：# pass 11 # fail 0；vite build ✓ built in 2.69s

Independent QA remains required / 仍需独立 QA。
