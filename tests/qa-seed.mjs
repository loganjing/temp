import { randomUUID } from 'node:crypto'
import { initializePlatform } from '../app/ticket-system/src/server/platform/bootstrap.ts'

const QA_PASSWORD = 'qa-password-12345'

async function createCompany(platform, name) {
  const id = randomUUID()
  const now = Date.now()
  await platform.db.run({
    text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)',
    params: [id, name, now],
  })
  return { id, name, createdAt: now }
}

async function createGroup(platform, companyId, name) {
  const id = randomUUID()
  const now = Date.now()
  await platform.db.run({
    text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
    params: [id, companyId, name, now],
  })
  return { id, companyId, name, createdAt: now }
}

async function createAssignmentRule(platform, companyId, category, groupId) {
  const id = randomUUID()
  const now = Date.now()
  await platform.db.run({
    text: 'INSERT INTO category_assignment_rules (id, company_id, category, group_id, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, companyId, category, groupId, now],
  })
  return { id, companyId, category, groupId, createdAt: now }
}

async function createUser(platform, { name, email, companyId, fullName, departmentId }) {
  const user = await platform.auth.userStore.create(
    { name, email, companyId, passwordChangeRequired: false },
    platform.auth.hashPassword(QA_PASSWORD),
  )
  if (fullName) {
    await platform.db.run({
      text: 'INSERT INTO user_profiles (user_id, company_id, full_name, department_id) VALUES (?, ?, ?, ?)',
      params: [user.id, companyId, fullName, departmentId ?? null],
    })
  }
  return user
}

async function seed() {
  const platform = await initializePlatform()
  try {
    // Company A — TechCorp
    const companyA = await createCompany(platform, 'TechCorp')
    const groupA1 = await createGroup(platform, companyA.id, 'Network Support')
    const groupA2 = await createGroup(platform, companyA.id, 'Level 2 Support')
    await createAssignmentRule(platform, companyA.id, 'network', groupA1.id)

    // Department for Company A
    const deptId = randomUUID()
    await platform.db.run({
      text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
      params: [deptId, companyA.id, 'Engineering', Date.now()],
    })

    // Users for Company A
    const alice = await createUser(platform, {
      name: 'Alice', email: 'alice@techcorp.test',
      companyId: companyA.id, fullName: 'Alice Smith', departmentId: deptId,
    })
    const bob = await createUser(platform, {
      name: 'Bob', email: 'bob@techcorp.test',
      companyId: companyA.id, fullName: 'Bob Jones', departmentId: deptId,
    })

    // Add Bob as member of Network Support group
    await platform.db.run({
      text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
      params: [randomUUID(), groupA1.id, bob.id, Date.now()],
    })

    // Company B — DataInc
    const companyB = await createCompany(platform, 'DataInc')
    await createUser(platform, {
      name: 'Carol', email: 'carol@datainc.test',
      companyId: companyB.id, fullName: 'Carol Lee',
    })

    // Create some tickets through the API to get audit logs and proper state
    const { createApp } = await import('../app/ticket-system/src/server/app.ts')
    const { registerPublicRoutes, registerProtectedRoutes } = await import('../app/ticket-system/src/server/routes.ts')
    const { withHttpServer } = await import('../app/ticket-system/test/with-http-server.mjs')
    const app = createApp({
      registerPublicRoutes: (r) => registerPublicRoutes(r, platform),
      registerProtectedRoutes: (r) => registerProtectedRoutes(r, platform),
      protect: platform.auth.requireAnyAuth,
    })

    await withHttpServer(app, async (url) => {
      const loginRes = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@techcorp.test', password: QA_PASSWORD }),
      })
      const { token } = await loginRes.json()
      const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      // Ticket 1: network category → auto-assigned to Network Support
      const t1 = await (await fetch(`${url}/api/tickets`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ subject: 'Network outage in Building A', description: 'Internet is down for all users in Building A', category: 'network', slaPriority: 'P0' }),
      })).json()

      // Ticket 2: general category → pending_assign
      const t2 = await (await fetch(`${url}/api/tickets`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ subject: 'Password reset request', description: 'Need to reset password for shared account', category: 'general', slaPriority: 'P3' }),
      })).json()

      // Reply to ticket 1
      await fetch(`${url}/api/tickets/${t1.id}/replies`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ content: 'This is urgent, please prioritize' }),
      })

      // Manually assign ticket 2 to Bob
      await fetch(`${url}/api/tickets/${t2.id}`, {
        method: 'PATCH', headers: auth,
        body: JSON.stringify({ status: 'pending_process', assignedUserId: bob.id }),
      })

      // Complete ticket 1
      await fetch(`${url}/api/tickets/${t1.id}`, {
        method: 'PATCH', headers: auth,
        body: JSON.stringify({ status: 'completed' }),
      })

      // Evaluate completed ticket
      await fetch(`${url}/api/tickets/${t1.id}/evaluation`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ rating: 5 }),
      })
    })

    console.log(JSON.stringify({
      status: 'ok',
      password: QA_PASSWORD,
      users: [
        { email: 'alice@techcorp.test', password: QA_PASSWORD, company: 'TechCorp', fullName: 'Alice Smith' },
        { email: 'bob@techcorp.test', password: QA_PASSWORD, company: 'TechCorp', fullName: 'Bob Jones' },
        { email: 'carol@datainc.test', password: QA_PASSWORD, company: 'DataInc', fullName: 'Carol Lee' },
      ],
    }))
  } finally {
    await platform.close()
  }
}

seed().catch((err) => { console.error(err); process.exit(1) })
