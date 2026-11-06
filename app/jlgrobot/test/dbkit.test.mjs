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
      assert.equal((await platform.db.queryOne({ text: "SELECT name FROM sqlite_master WHERE name = 'commonapp_migrations'" }))?.name, 'commonapp_migrations')
    } finally {
      await platform.close()
    }
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
})
