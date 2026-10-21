// QA verification data provisioning for wi-t1000329 (verification stage).
// Idempotent: matches existing records by unique names before creating.
const BASE = process.env.QA_BASE_URL ?? 'http://localhost:4520'

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  return json
}

// 1. cold-start bootstrap (ignore if already bootstrapped)
try {
  await call('/api/auth/bootstrap', { method: 'POST', body: { username: 'qaadmin', password: 'Qa-Admin-4520' } })
} catch (e) {
  if (!String(e.message).includes('409')) throw e
}

// 2. admin login
const login = await call('/api/auth/login', { method: 'POST', body: { username: 'qaadmin', password: 'Qa-Admin-4520' } })
const admin = login.token

// 3. companies (match by name)
const companyList = (await call('/api/companies', { token: admin })).items ?? []
async function ensureCompany(name) {
  const found = companyList.find((c) => c.name === name)
  if (found) return found
  return call('/api/companies', { method: 'POST', token: admin, body: { name } })
}
const companyA = await ensureCompany('QA甲公司')
const companyB = await ensureCompany('QA乙公司')

// 4. categories (migration seeds)
const categories = (await call('/api/categories', { token: admin })).items ?? []
const categoryIds = {}
for (const c of categories) categoryIds[c.name] = c.id

// 5. users (match by username)
const userList = (await call('/api/users', { token: admin })).items ?? []
const userSpecs = [
  { username: 'qa-submitter-a1', password: 'Qa-SubA1-4520', displayName: 'QA提交人甲一', email: 'qa-a1@qa.example.com', companyId: companyA.id, department: 'QA研发部', role: 'submitter' },
  { username: 'qa-submitter-b1', password: 'Qa-SubB1-4520', displayName: 'QA提交人乙一', email: 'qa-b1@qa.example.com', companyId: companyB.id, department: 'QA市场部', role: 'submitter' },
  { username: 'qa-agent-g1', password: 'Qa-Agent1-4520', displayName: 'QA处理人一组', email: 'qa-g1@qa.example.com', companyId: companyA.id, department: 'QA运营部', role: 'agent' },
  { username: 'qa-agent-g2', password: 'Qa-Agent2-4520', displayName: 'QA处理人二组', email: 'qa-g2@qa.example.com', companyId: companyA.id, department: 'QA运营部', role: 'agent' },
]
const users = {}
for (const spec of userSpecs) {
  const found = userList.find((u) => u.username === spec.username)
  const created = found ?? await call('/api/users', { method: 'POST', token: admin, body: spec })
  users[spec.username] = { id: created.userId ?? created.id, username: spec.username, password: spec.password, displayName: spec.displayName }
}

// 6. business groups (company A, match by name)
const groupList = (await call(`/api/companies/${companyA.id}/groups`, { token: admin })).items ?? []
async function ensureGroup(name) {
  const found = groupList.find((g) => g.name === name)
  if (found) return found
  return call(`/api/companies/${companyA.id}/groups`, { method: 'POST', token: admin, body: { name } })
}
const group1 = await ensureGroup('QA一线支持组')
const group2 = await ensureGroup('QA二线支持组')

// 7. group members (skip duplicates)
async function ensureMember(groupId, user) {
  const members = (await call(`/api/groups/${groupId}/members`, { token: admin })).items ?? []
  if (members.some((m) => m.userId === user.id)) return
  await call(`/api/groups/${groupId}/members`, { method: 'POST', token: admin, body: { userId: user.id } })
}
await ensureMember(group1.id, users['qa-agent-g1'])
await ensureMember(group2.id, users['qa-agent-g2'])

// 8. routing rule: 账号问题 -> group1 (company A); 登录故障 stays unmatched
const ruleList = (await call(`/api/companies/${companyA.id}/routing-rules`, { token: admin })).items ?? []
const targetCategory = categoryIds['账号问题']
let rule = ruleList.find((r) => r.categoryId === targetCategory)
if (!rule) {
  rule = await call(`/api/companies/${companyA.id}/routing-rules`, {
    method: 'POST',
    token: admin,
    body: { categoryId: targetCategory, groupId: group1.id },
  })
}

console.log(JSON.stringify({
  baseUrl: BASE,
  admin: { username: 'qaadmin', password: 'Qa-Admin-4520' },
  companies: { A: { id: companyA.id, name: companyA.name }, B: { id: companyB.id, name: companyB.name } },
  groups: { G1: { id: group1.id, name: group1.name }, G2: { id: group2.id, name: group2.name } },
  users: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, { id: v.id, displayName: v.displayName, password: v.password }])),
  categories: categoryIds,
  rule,
}, null, 2))
