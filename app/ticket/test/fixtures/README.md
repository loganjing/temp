# QA fixtures

`withQaEnvironment` gives each run a temporary SQLite database and a unique `QA_RUN_ID`, then closes and removes the database. Initialize the application platform inside its callback so it uses that database.

`seedQaIdentity` creates a fresh active user with a generated password, an optional company ID, and `passwordChangeRequired: false`. If the application has company, role, permission, or business tables, seed those records in an app-owned callback and pass the role assignment and authorization checks through `assignRoles` and `verifyAuthorization`. Keep those records in the same run-scoped database and do not write credentials to reports or logs.

After seeding, verify the account through the real login endpoint and verify the selected company and permissions through the application's API. Check `/api/health` for the same `QA_RUN_ID` before starting browser acceptance.

## Ticket demo environment

`withTicketEnvironment` combines `withQaEnvironment` with `seedDemoData`, so each run gets a fresh database containing two companies, multi-department accounts, business groups and members, categories, assignment rules, and sample tickets with replies, ratings, and notification records. `createTicketApp(platform)` returns the real application and `loginTicketAccount(url, email)` logs in through `POST /api/auth/login`.

All demo accounts use the password exported as `DEMO_PASSWORD` from `test/fixtures/ticket-environment.mjs`. Accounts:

| Company | Email | Role |
| --- | --- | --- |
| 云启科技（ACME） | `admin.acme@example.test` | 公司管理员 |
| 云启科技（ACME） | `finance.acme@example.test` | 财务支持组处理人 |
| 云启科技（ACME） | `tech.acme@example.test` | 技术支持组处理人 |
| 云启科技（ACME） | `user.acme@example.test` | 提交人 |
| 云启科技（ACME） | `fail@acme.example.test` | 提交人（用于不可投递通知） |
| 云启科技（ACME） | `stats@acme.example.test` | 平台统计只读 |
| 环宇贸易（GLOBEX） | `admin.globex@example.test` | 公司管理员 |
| 环宇贸易（GLOBEX） | `agent.globex@example.test` | 客户服务组处理人 |
| 环宇贸易（GLOBEX） | `user.globex@example.test` | 提交人 |

`fake-smtp.mjs` is a local SMTP sink for the completion-notification path: run it with `node --import tsx test/fixtures/fake-smtp.mjs` (or `npm run mail:sink`), then point `SMTP_HOST`/`SMTP_PORT` at it. Delivered messages are appended as JSON lines to `MAIL_SINK_FILE` (default `./data/mail-sink.jsonl`); recipients beginning with `fail@` are rejected with `550`.

`test/smoke-notifications.mjs` runs the same flow end to end against real HTTP: it seeds twice into a temporary database to prove idempotency, checks the demo data required by the architecture baseline, then starts the application on a free port with the mail sink attached to exercise `sent`, `550 → failed` (ticket stays completed) and the manual retry that succeeds after the submitter address is corrected. Run it from `app/ticket` with `node test/smoke-notifications.mjs`; it removes its temporary databases and stops the process it started.
