import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { createAuthBoundary } from '../src/server/platform/auth.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'

const directory = await mkdtemp(path.join(tmpdir(), 'ticket-groups-'))
process.env.DB_PATH = path.join(directory, 'application.db')
const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: createAuthBoundary(platform.db),
})

after(async () => {
  await platform.close()
  await rm(directory, { recursive: true, force: true })
})

async function login(username) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'Demo@1234' }),
  })
  const { token } = await response.json()
  return token
}

const alice = await login('alice')
const carol = await login('carol')

function authed(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

test('category dictionary and company user directory are readable', async () => {
  const categories = await app.request('/api/categories', { headers: authed(alice) })
  assert.equal(categories.status, 200)
  const categoryData = await categories.json()
  assert.equal(categoryData.items.length, 8)
  assert.deepEqual(categoryData.items[2], { id: 3, code: 'bug', name: '功能缺陷' })

  const users = await app.request('/api/users', { headers: authed(alice) })
  assert.equal(users.status, 200)
  const userData = await users.json()
  assert.deepEqual(userData.items.map((u) => u.username).sort(), ['alice', 'bob'])
})

test('groups are company-private: create, duplicate name, members, removal', async () => {
  const created = await app.request('/api/groups', {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ name: '平台支持组', description: '处理平台类问题' }),
  })
  assert.equal(created.status, 200)
  const { group } = await created.json()
  assert.equal(group.name, '平台支持组')
  assert.equal(group.description, '处理平台类问题')
  assert.equal(group.memberCount, 0)
  assert.deepEqual(group.members, [])

  const duplicate = await app.request('/api/groups', {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ name: '平台支持组' }),
  })
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).error.code, 'STATE_CONFLICT')

  const invalid = await app.request('/api/groups', {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ name: '   ' }),
  })
  assert.equal(invalid.status, 422)

  const withMembers = await app.request(`/api/groups/${group.id}/members`, {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ userIds: [2] }),
  })
  assert.equal(withMembers.status, 200)
  const memberData = await withMembers.json()
  assert.equal(memberData.group.memberCount, 1)
  assert.deepEqual(memberData.group.members[0], { id: 2, username: 'bob', fullName: '王强', department: '客服部' })

  const again = await app.request(`/api/groups/${group.id}/members`, {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ userIds: [2] }),
  })
  assert.equal(again.status, 200)
  assert.equal((await again.json()).group.memberCount, 1)

  const crossCompanyUser = await app.request(`/api/groups/${group.id}/members`, {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ userIds: [3] }),
  })
  assert.equal(crossCompanyUser.status, 422)

  const removed = await app.request(`/api/groups/${group.id}/members/2`, { method: 'DELETE', headers: authed(alice) })
  assert.equal(removed.status, 204)
  const removedAgain = await app.request(`/api/groups/${group.id}/members/2`, { method: 'DELETE', headers: authed(alice) })
  assert.equal(removedAgain.status, 404)

  const crossCompanyGroup = await app.request(`/api/groups/${group.id}/members`, {
    method: 'POST',
    headers: authed(carol),
    body: JSON.stringify({ userIds: [4] }),
  })
  assert.equal(crossCompanyGroup.status, 404)

  const carolGroup = await app.request('/api/groups', {
    method: 'POST',
    headers: authed(carol),
    body: JSON.stringify({ name: '平台支持组' }),
  })
  assert.equal(carolGroup.status, 200)

  const aliceList = await app.request('/api/groups', { headers: authed(alice) })
  const aliceData = await aliceList.json()
  assert.equal(aliceData.items.length, 1)
  assert.equal(aliceData.items[0].name, '平台支持组')

  const carolList = await app.request('/api/groups', { headers: authed(carol) })
  const carolData = await carolList.json()
  assert.equal(carolData.items.length, 1)
  assert.notEqual(carolData.items[0].id, aliceData.items[0].id)
})

test('assignment rules upsert, re-point and delete within one company', async () => {
  const first = await app.request('/api/groups', {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ name: '一线受理组' }),
  })
  const g1 = (await first.json()).group
  const second = await app.request('/api/groups', {
    method: 'POST',
    headers: authed(alice),
    body: JSON.stringify({ name: '二线处理组' }),
  })
  const g2 = (await second.json()).group
  await app.request(`/api/groups/${g1.id}/members`, { method: 'POST', headers: authed(alice), body: JSON.stringify({ userIds: [2] }) })

  const upsert = await app.request('/api/assignment-rules', {
    method: 'PUT',
    headers: authed(alice),
    body: JSON.stringify({ categoryId: 3, groupId: g1.id }),
  })
  assert.equal(upsert.status, 200)
  const { rule } = await upsert.json()
  assert.equal(rule.categoryId, 3)
  assert.equal(rule.categoryName, '功能缺陷')
  assert.equal(rule.groupId, g1.id)
  assert.equal(rule.groupName, '一线受理组')

  const repoint = await app.request('/api/assignment-rules', {
    method: 'PUT',
    headers: authed(alice),
    body: JSON.stringify({ categoryId: 3, groupId: g2.id }),
  })
  assert.equal(repoint.status, 200)
  assert.equal((await repoint.json()).rule.groupId, g2.id)

  const list = await app.request('/api/assignment-rules', { headers: authed(alice) })
  const listData = await list.json()
  assert.equal(listData.items.length, 1)
  assert.equal(listData.items[0].groupId, g2.id)

  const crossCompanyRule = await app.request('/api/assignment-rules', {
    method: 'PUT',
    headers: authed(carol),
    body: JSON.stringify({ categoryId: 3, groupId: g2.id }),
  })
  assert.equal(crossCompanyRule.status, 404)

  const invalidCategory = await app.request('/api/assignment-rules', {
    method: 'PUT',
    headers: authed(carol),
    body: JSON.stringify({ categoryId: 99, groupId: g2.id }),
  })
  assert.equal(invalidCategory.status, 422)

  const carolRules = await app.request('/api/assignment-rules', { headers: authed(carol) })
  assert.deepEqual((await carolRules.json()).items, [])

  const repointBack = await app.request('/api/assignment-rules', {
    method: 'PUT',
    headers: authed(alice),
    body: JSON.stringify({ categoryId: 3, groupId: g1.id }),
  })
  assert.equal(repointBack.status, 200)

  const deleted = await app.request('/api/assignment-rules/3', { method: 'DELETE', headers: authed(alice) })
  assert.equal(deleted.status, 204)
  const deletedAgain = await app.request('/api/assignment-rules/3', { method: 'DELETE', headers: authed(alice) })
  assert.equal(deletedAgain.status, 404)

  const afterDelete = await app.request('/api/assignment-rules', { headers: authed(alice) })
  assert.deepEqual((await afterDelete.json()).items, [])
})
