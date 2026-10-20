import 'dotenv/config'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { seedDemoData, SEED_COMPANIES } from '../src/server/seed.ts'

const platform = await initializePlatform()
try {
  const summary = await seedDemoData(platform)
  const companyNames = SEED_COMPANIES.map((company) => company.name).join('、')
  console.log(`[seed] demo data ready (companies: ${summary.companies}, users: ${summary.users}, groups: ${summary.groups}, rules: ${summary.rules})`)
  console.log(`[seed] companies: ${companyNames}`)
  console.log('[seed] login with <email> / Demo#12345, for example a-submitter@demo.io')
  console.log('[seed] no ticket data is preloaded')
} finally {
  await platform.db.close()
}
