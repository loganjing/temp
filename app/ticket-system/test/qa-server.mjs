// QA server: seeds isolated test data and starts the Hono HTTP server on port 0.
// Used by the verification stage for browser-based acceptance checks.
import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { seedTicketEnvironment } from './fixtures/qa-environment.mjs'

const qaRunId = `qa-${randomUUID()}`
const directory = await mkdtemp(path.join(os.tmpdir(), 'app-qa-'))
const databasePath = path.join(directory, 'application.sqlite')

process.env.DB_PATH = databasePath
process.env.QA_RUN_ID = qaRunId

const platform = await initializePlatform()
const env = await seedTicketEnvironment(platform, { qaRunId })

const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: platform.auth.requireAnyAuth,
})

const port = 0
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  const addr = server.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : port
  // Output machine-readable JSON for the QA driver to read
  console.log(JSON.stringify({
    status: 'ready',
    port: actualPort,
    qaRunId,
    dbPath: databasePath,
    accounts: {
      submitterA: { email: env.submitterA.email, password: env.password, role: 'submitter' },
      handlerA: { email: env.handlerA.email, password: env.password, role: 'handler' },
      adminA: { email: env.adminA.email, password: env.password, role: 'admin' },
      submitterB: { email: env.submitterB.email, password: env.password, role: 'submitter' },
    },
    data: {
      companyA: env.companyA,
      companyB: env.companyB,
      groupA: env.groupA,
      groupB: env.groupB,
      catA: env.catA,
      catAUnassigned: env.catAUnassigned,
      deptA: env.deptA,
    },
  }))
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}
