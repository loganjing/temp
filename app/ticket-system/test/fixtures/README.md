# QA fixtures

`withQaEnvironment` gives each run a temporary SQLite database and a unique `QA_RUN_ID`, then closes and removes the database. Initialize the application platform inside its callback so it uses that database.

`seedQaIdentity` creates a fresh active user with a generated password, an optional company ID, and `passwordChangeRequired: false`. If the application has company, role, permission, or business tables, seed those records in an app-owned callback and pass the role assignment and authorization checks through `assignRoles` and `verifyAuthorization`. Keep those records in the same run-scoped database and do not write credentials to reports or logs.

After seeding, verify the account through the real login endpoint and verify the selected company and permissions through the application's API. Check `/api/health` for the same `QA_RUN_ID` before starting browser acceptance.

## Ticket system demo data

`initializePlatform()` applies migrations `0002_org.sql` through `0005_events_notifications.sql` and then runs an idempotent demo seed (`SEED_DEMO_DATA=false` disables it). Every seeded account uses the password `Ticket@123456`.

| Role | Email | Company | Department |
| --- | --- | --- | --- |
| 提交人 | `submitter@acme.test` | Acme 科技 (`company-acme`) | 信息技术部 |
| 处理人 | `handler@acme.test` | Acme 科技 | 信息技术部（技术支持组） |
| 处理人 | `handler2@acme.test` | Acme 科技 | 信息技术部（客户成功组） |
| 管理员 | `admin@acme.test` | Acme 科技 | 信息技术部 |
| 提交人 | `submitter@globex.test` | Globex 制造 (`company-globex`) | 财务部 |
| 处理人 | `handler@globex.test` | Globex 制造 | 运营部（运维支持组） |
| 管理员 | `admin@globex.test` | Globex 制造 | 运营部 |
| 平台运营 | `ops@ticket.test` | Globex 制造 | 运营部 |

Seeded categories are `cat-software` (软件故障), `cat-account` (账号与权限), `cat-billing` (计费与账单) and `cat-consult` (其他咨询). Acme has one rule: `cat-software → group-acme-tech` (技术支持组). Acme groups are `group-acme-tech` and `group-acme-success`; Globex has `group-globex-ops`.
