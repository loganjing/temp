// QA seed script: initializes platform, seeds ticket system data, outputs credentials as JSON.
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..')
const APP_ROOT = path.join(WORKSPACE_ROOT, 'app', 'ticket-system')

// Use a fixed QA run ID and database path for this verification session.
const QA_RUN_ID = process.env.QA_RUN_ID || `qa-verify-${randomUUID()}`
const DB_DIR = path.join(WORKSPACE_ROOT, 'tests', 'qa-data')
const DB_PATH = path.join(DB_DIR, 'ticket-verify.sqlite')

process.env.QA_RUN_ID = QA_RUN_ID
process.env.DB_PATH = DB_PATH

await mkdir(DB_DIR, { recursive: true })

// Import application modules from the app package.
const { initializePlatform } = await import(path.join(APP_ROOT, 'src', 'server', 'platform', 'bootstrap.ts'))
const { seedQaTicketEnvironment } = await import(path.join(APP_ROOT, 'test', 'fixtures', 'qa-environment.mjs'))

const platform = await initializePlatform()
try {
  const env = await seedQaTicketEnvironment(platform, { qaRunId: QA_RUN_ID })

  // Output credentials and entity IDs as JSON for the verification session.
  const output = {
    qaRunId: QA_RUN_ID,
    dbPath: DB_PATH,
    companies: env.companies,
    departments: env.departments,
    categories: env.categories,
    groups: env.groups,
    users: {
      submitterA: { ...env.users.submitterA },
      handlerA: { ...env.users.handlerA },
      adminA: { ...env.users.adminA },
      submitterB: { ...env.users.submitterB },
    },
  }
  console.log(JSON.stringify(output, null, 2))
} finally {
  await platform.close()
}
