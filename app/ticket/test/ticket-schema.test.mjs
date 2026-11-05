import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { withQaEnvironment } from './fixtures/qa-environment.mjs'

test('ticket migrations create the versioned schema, constraints, and indexes', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const tables = await platform.db.queryAll({ text: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name" })
      const names = tables.map((table) => table.name)
      for (const table of [
        'companies',
        'user_profiles',
        'ticket_categories',
        'business_groups',
        'business_group_members',
        'assignment_rules',
        'counters',
        'tickets',
        'ticket_replies',
        'ticket_logs',
        'ticket_ratings',
        'ticket_notifications',
      ]) {
        assert.ok(names.includes(table), `missing table ${table}`)
      }

      const indexes = await platform.db.queryAll({ text: "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name" })
      const indexNames = indexes.map((index) => index.name)
      for (const index of [
        'tickets_company_status_created_idx',
        'tickets_company_group_status_idx',
        'tickets_company_submitter_created_idx',
        'ticket_replies_ticket_created_idx',
        'ticket_logs_ticket_created_idx',
        'ticket_notifications_ticket_created_idx',
        'ticket_categories_company_enabled_idx',
        'business_groups_company_enabled_idx',
      ]) {
        assert.ok(indexNames.includes(index), `missing index ${index}`)
      }

      const applied = await platform.db.queryAll({ text: "SELECT name FROM commonapp_migrations WHERE name LIKE '0101%'" })
      assert.equal(applied.length, 1)
      const counter = await platform.db.queryOne({ text: "SELECT value FROM counters WHERE name = 'ticket_code'" })
      assert.equal(counter.value, 0)

      await platform.db.run({
        text: `INSERT INTO companies (id, code, name, created_at) VALUES ('schema-company', 'SCHEMA', 'Schema', '2026-01-01T00:00:00.000Z')`,
      })
      await assert.rejects(
        platform.db.run({
          text: `INSERT INTO companies (id, code, name, created_at) VALUES ('schema-company-2', 'SCHEMA', 'Schema 2', '2026-01-01T00:00:00.000Z')`,
        }),
        /unique constraint/i,
        'company code must be unique',
      )

      await platform.db.run({ text: "INSERT INTO ticket_categories (id, company_id, name, created_at, updated_at) VALUES ('schema-category', 'schema-company', '分类', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')" })
      await assert.rejects(
        platform.db.run({
          text: `INSERT INTO tickets (id, code, company_id, subject, description, category_id, priority, status, submitter_id, created_at, updated_at)
                 VALUES ('schema-ticket', 'TK-000001', 'schema-company', '主题', '描述', 'schema-category', 'P9', 'pending', 'missing-user', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
        }),
        /CHECK constraint/i,
        'priority values outside P0-P4 must be rejected',
      )
    } finally {
      await platform.close()
    }
  })
})
