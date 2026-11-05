import 'dotenv/config'
import { initializePlatform } from './platform/bootstrap'
import { seedDemoData } from './seed-data'

const platform = await initializePlatform()
try {
  const seeded = await seedDemoData(platform)
  const users = Object.values(seeded.accounts)
  console.log(
    `[seed] companies=${Object.keys(seeded.companies).length} users=${users.length} groups=${Object.keys(seeded.groups).length} categories=${Object.keys(seeded.categories).length} tickets=8`,
  )
} finally {
  await platform.close()
}
