import { createApp } from '../../src/server/app.ts'
import { initializePlatform } from '../../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../../src/server/routes.ts'
import { DEMO_PASSWORD, seedDemoData } from '../../src/server/seed-data.ts'
import { withQaEnvironment } from './qa-environment.mjs'

export { DEMO_PASSWORD }

/** Run the callback against a fresh database seeded with the demo companies and tickets. */
export async function withTicketEnvironment(run) {
  return withQaEnvironment(async (environment) => {
    const platform = await initializePlatform()
    try {
      const seeded = await seedDemoData(platform)
      return await run({ ...environment, platform, seeded })
    } finally {
      await platform.close()
    }
  })
}

/** Assemble the real application against an initialized platform. */
export function createTicketApp(platform) {
  return createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAppAuth,
  })
}

/** Log in through the real endpoint and return the bearer token and profile. */
export async function loginTicketAccount(baseUrl, email, password = DEMO_PASSWORD) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (response.status !== 200) throw new Error(`Demo account ${email} could not log in: HTTP ${response.status}`)
  const body = await response.json()
  return { token: body.token, user: body.user }
}
