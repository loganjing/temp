# QA fixtures

`withQaEnvironment` gives each run a temporary SQLite database and a unique `QA_RUN_ID`, then closes and removes the database. Initialize the application platform inside its callback so it uses that database.

`seedQaIdentity` creates a fresh active user with a generated password, an optional company ID, and `passwordChangeRequired: false`. If the application has company, role, permission, or business tables, seed those records in an app-owned callback and pass the role assignment and authorization checks through `assignRoles` and `verifyAuthorization`. Keep those records in the same run-scoped database and do not write credentials to reports or logs.

After seeding, verify the account through the real login endpoint and verify the selected company and permissions through the application's API. Check `/api/health` for the same `QA_RUN_ID` before starting browser acceptance.
