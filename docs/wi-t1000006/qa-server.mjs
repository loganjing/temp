// QA verification seed + server script.
// Run from app/ticket-system/ directory: node --import tsx <this-file>
import { serve } from '@hono/node-server'
import { createApp } from '/Users/loganjing/lingeebuild-beta/workspaces/64814fc7b41150ceb6de32dedc8559d4/JLGSpace-88/.lingee-task-worktrees/wi-t1000006/app/ticket-system/src/server/app.ts'
import { initializePlatform } from '/Users/loganjing/lingeebuild-beta/workspaces/64814fc7b41150ceb6de32dedc8559d4/JLGSpace-88/.lingee-task-worktrees/wi-t1000006/app/ticket-system/src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '/Users/loganjing/lingeebuild-beta/workspaces/64814fc7b41150ceb6de32dedc8559d4/JLGSpace-88/.lingee-task-worktrees/wi-t1000006/app/ticket-system/src/server/routes.ts'

const COMPANY_A = 'company-a'
const COMPANY_B = 'company-b'
const PASSWORD = 'correct-horse-battery'

const PEOPLE = [
  { key: 'subA', memberId: 'mem-a-sub', companyId: COMPANY_A, departmentId: 'dept-a-support', name: 'Amy Submitter', email: 'sub-a@example.com', roles: ['submitter'] },
  { key: 'agentA', memberId: 'mem-a-agent', companyId: COMPANY_A, departmentId: 'dept-a-support', name: 'Aaron Agent', email: 'agent-a@example.com', roles: ['agent'] },
  { key: 'agentA2', memberId: 'mem-a-agent2', companyId: COMPANY_A, departmentId: 'dept-a-support', name: 'Abby Agent', email: 'agent-a2@example.com', roles: ['agent'] },
  { key: 'mgrA', memberId: 'mem-a-mgr', companyId: COMPANY_A, departmentId: null, name: 'Mia Manager', email: 'mgr-a@example.com', roles: ['manager'] },
  { key: 'subB', memberId: 'mem-b-sub', companyId: COMPANY_B, departmentId: null, name: 'Bob Submitter', email: 'sub-b@example.com', roles: ['submitter'] },
  { key: 'agentB', memberId: 'mem-b-agent', companyId: COMPANY_B, departmentId: null, name: 'Bea Agent', email: 'agent-b@example.com', roles: ['agent'] },
  { key: 'mgrB', memberId: 'mem-b-mgr', companyId: COMPANY_B, departmentId: null, name: 'Ben Manager', email: 'mgr-b@example.com', roles: ['manager'] },
]

async function seed(platform) {
  const db = platform.db
  const ts = new Date().toISOString()
  await db.run({ text: 'INSERT INTO companies (id, name, code, created_at) VALUES (?, ?, ?, ?)', params: [COMPANY_A, 'Acme 支持', 'ACME', ts] })
  await db.run({ text: 'INSERT INTO companies (id, name, code, created_at) VALUES (?, ?, ?, ?)', params: [COMPANY_B, 'Beta 支持', 'BETA', ts] })
  await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: ['dept-a-support', COMPANY_A, '售后部', ts] })

  const credentials = {}
  for (const person of PEOPLE) {
    const user = await platform.auth.userStore.create(
      { name: person.name, email: person.email, passwordChangeRequired: false },
      platform.auth.hashPassword(PASSWORD),
    )
    credentials[person.key] = { email: person.email, password: PASSWORD }
    await db.run({
      text: 'INSERT INTO company_members (id, company_id, department_id, user_id, display_name, email, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      params: [person.memberId, person.companyId, person.departmentId, user.id, person.name, person.email, ts],
    })
    for (const role of person.roles) {
      await db.run({ text: 'INSERT INTO company_member_roles (member_id, role_code) VALUES (?, ?)', params: [person.memberId, role] })
    }
  }

  // Pre-create business group and assignment rule so auto-assignment can be verified
  const grp = await db.run({
    text: "INSERT INTO business_groups (id, company_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    params: ['bg-hardware-a', COMPANY_A, '硬件支持组', '硬件问题处理', ts, ts],
  })
  await db.run({
    text: "INSERT INTO business_group_members (group_id, member_id) VALUES (?, ?)",
    params: ['bg-hardware-a', 'mem-a-agent'],
  })
  await db.run({
    text: "INSERT INTO assignment_rules (id, company_id, category, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    params: ['ar-hw-a', COMPANY_A, 'Hardware', 'bg-hardware-a', ts, ts],
  })

  // Pre-create a second business group for transfer/assign tests
  await db.run({
    text: "INSERT INTO business_groups (id, company_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    params: ['bg-software-a', COMPANY_A, '软件支持组', '软件问题处理', ts, ts],
  })
  await db.run({
    text: "INSERT INTO business_group_members (group_id, member_id) VALUES (?, ?)",
    params: ['bg-software-a', 'mem-a-agent'],
  })
  await db.run({
    text: "INSERT INTO business_group_members (group_id, member_id) VALUES (?, ?)",
    params: ['bg-software-a', 'mem-a-agent2'],
  })

  return credentials
}

const platform = await initializePlatform()
const credentials = await seed(platform)
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: platform.auth.requireAnyAuth,
})

const port = Number(process.env.PORT || 3000)
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[qa-server] listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}

// Output credentials for QA to pick up
console.log('[qa-seed] credentials:', JSON.stringify(credentials))
