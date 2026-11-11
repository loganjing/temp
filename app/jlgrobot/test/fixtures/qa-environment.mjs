import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const restore = (key, value) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

/**
 * Run setup against a unique SQLite database and QA_RUN_ID, then remove all run data.
 * Initialize the application platform inside its callback so it uses that database.
 */
export async function withQaEnvironment(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-qa-'))
  const databasePath = path.join(directory, 'application.sqlite')
  const qaRunId = `qa-${randomUUID()}`
  const previousDatabasePath = process.env.DB_PATH
  const previousQaRunId = process.env.QA_RUN_ID
  process.env.DB_PATH = databasePath
  process.env.QA_RUN_ID = qaRunId

  try {
    return await run({ databasePath, qaRunId })
  } finally {
    restore('DB_PATH', previousDatabasePath)
    restore('QA_RUN_ID', previousQaRunId)
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * Seed a base equipment row directly into the platform database for QA scenarios
 * that need a pre-existing device before exercising API endpoints.
 */
export async function seedEquipment(platform, { identifier = `EQ-${randomUUID()}`, name = 'QA 设备' } = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await platform.db.run({
    text: 'INSERT INTO equipment (id, name, identifier, type, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, name, identifier, null, now],
  })
  return { id, name, identifier, type: null, created_at: now }
}
