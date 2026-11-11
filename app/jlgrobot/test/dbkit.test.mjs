import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'

test('dbkit startup opens SQLite, applies migrations, and closes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'platform-db-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  try {
    const platform = await initializePlatform()
    try {
      assert.equal((await platform.db.queryOne({ text: 'SELECT 1 AS value' }))?.value, 1)
      assert.equal(
        (await platform.db.queryOne({ text: "SELECT name FROM sqlite_master WHERE name = 'commonapp_migrations'" }))?.name,
        'commonapp_migrations',
      )
    } finally {
      await platform.close()
    }
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
})

test('migration creates the full business schema with expected tables', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'platform-db-schema-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  try {
    const platform = await initializePlatform()
    try {
      const row = await platform.db.queryOne({
        text: `SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN (
          'equipment','equipment_status','faults','fault_status_logs',
          'upgrade_tasks','upgrade_status_logs','work_orders','work_order_status_logs','work_order_records'
        )`,
      })
      assert.equal(row?.total, 9)
    } finally {
      await platform.close()
    }
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
})

test('dbkit transaction commits writes that are readable afterwards', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'platform-db-tx-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  try {
    const platform = await initializePlatform()
    try {
      const id = '11111111-1111-4111-8111-111111111111'
      await platform.db.transaction(async (tx) => {
        await tx.run({
          text: 'INSERT INTO equipment (id, name, identifier, type, created_at) VALUES (?, ?, ?, ?, ?)',
          params: [id, 'tx-eq', 'TX-1', null, new Date().toISOString()],
        })
      })
      const row = await platform.db.queryOne({
        text: 'SELECT name FROM equipment WHERE id = ?',
        params: [id],
      })
      assert.equal(row?.name, 'tx-eq')
    } finally {
      await platform.close()
    }
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
})
