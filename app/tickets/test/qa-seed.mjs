/**
 * QA seed script: creates an isolated database with test companies, users, and role assignments.
 * Usage: node --import tsx test/qa-seed.mjs <dbPath> <qaRunId>
 * Prints JSON with account credentials to stdout.
 */
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { randomBytes } from 'node:crypto'

const dbPath = process.argv[2] ?? './data/qa-seed.sqlite'
const qaRunId = process.argv[3] ?? `qa-${Date.now()}`

process.env.DB_PATH = dbPath
process.env.QA_RUN_ID = qaRunId

const platform = await initializePlatform()

const companyA = 'comp-a'
const companyB = 'comp-b'
const password = 'Test1234!'

function genEmail(prefix, company) {
  return `${prefix}-${qaRunId}@${company}.test`
}

// Company A: admin, submitter, handler
const adminA = await platform.auth.userStore.create(
  { name: '管理员张三', email: genEmail('admin', companyA), companyId: companyA, department: 'IT部', role: 'admin', passwordChangeRequired: false },
  platform.auth.hashPassword(password),
)
await platform.permissionKit.assignRole(adminA.id, 'admin')

const submitterA = await platform.auth.userStore.create(
  { name: '提交人李四', email: genEmail('submitter', companyA), companyId: companyA, department: '技术部', role: 'submitter', passwordChangeRequired: false },
  platform.auth.hashPassword(password),
)
await platform.permissionKit.assignRole(submitterA.id, 'submitter')

const handlerA = await platform.auth.userStore.create(
  { name: '处理人王五', email: genEmail('handler', companyA), companyId: companyA, department: '运维部', role: 'handler', passwordChangeRequired: false },
  platform.auth.hashPassword(password),
)
await platform.permissionKit.assignRole(handlerA.id, 'handler')

// Company B: submitter (for isolation test)
const submitterB = await platform.auth.userStore.create(
  { name: 'B公司用户赵六', email: genEmail('submitter', companyB), companyId: companyB, department: '市场部', role: 'submitter', passwordChangeRequired: false },
  platform.auth.hashPassword(password),
)
await platform.permissionKit.assignRole(submitterB.id, 'submitter')

// Also create a handler in company B for workbench isolation test
const handlerB = await platform.auth.userStore.create(
  { name: 'B公司处理人钱七', email: genEmail('handler', companyB), companyId: companyB, department: '支持部', role: 'handler', passwordChangeRequired: false },
  platform.auth.hashPassword(password),
)
await platform.permissionKit.assignRole(handlerB.id, 'handler')

await platform.close()

const accounts = {
  qaRunId,
  dbPath,
  companyA,
  companyB,
  password,
  accounts: [
    { role: 'admin', company: companyA, name: '管理员张三', email: genEmail('admin', companyA), userId: adminA.id },
    { role: 'submitter', company: companyA, name: '提交人李四', email: genEmail('submitter', companyA), userId: submitterA.id },
    { role: 'handler', company: companyA, name: '处理人王五', email: genEmail('handler', companyA), userId: handlerA.id },
    { role: 'submitter', company: companyB, name: 'B公司用户赵六', email: genEmail('submitter', companyB), userId: submitterB.id },
    { role: 'handler', company: companyB, name: 'B公司处理人钱七', email: genEmail('handler', companyB), userId: handlerB.id },
  ],
}

console.log(JSON.stringify(accounts, null, 2))
