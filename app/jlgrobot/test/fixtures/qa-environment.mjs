import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const restore = (key, value) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

/** Run setup against a unique database and QA_RUN_ID, then remove all run data. */
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

/** Create a fresh login identity for the current QA run and verify its resolved state. */
export async function seedQaIdentity(platform, {
  qaRunId,
  companyId = `${qaRunId}-company`,
  assignRoles,
  verifyAuthorization,
}) {
  const email = `qa-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const created = await platform.auth.userStore.create({
    name: `QA ${qaRunId}`,
    email,
    companyId,
    passwordChangeRequired: false,
  }, platform.auth.hashPassword(password))
  await assignRoles?.(platform, { userId: created.id, companyId, qaRunId })
  const identity = await platform.auth.userResolver.findById(created.id)

  if (!identity || identity.status !== 'active' || identity.passwordChangeRequired || identity.companyId !== companyId)
    throw new Error('QA identity fixture did not create an active, ready-to-login account')
  await verifyAuthorization?.(platform, { identity, companyId, qaRunId })

  return { id: created.id, email, password, companyId }
}
