/**
 * QA seed script — sets up test identities for browser verification.
 * Uses the platform's internal permissionKit to assign roles,
 * which is not exposed as a public API endpoint.
 */
import 'dotenv/config'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'

const PW = 'TestPassword123!'

async function main() {
  const platform = await initializePlatform()
  try {
    // Find users by email
    const [alice, bob, carol] = await Promise.all([
      platform.auth.userStore.findByCredential('alice@ticket.com', 'email'),
      platform.auth.userStore.findByCredential('bob@ticket.com', 'email'),
      platform.auth.userStore.findByCredential('carol@ticket.com', 'email'),
    ])

    const users = { alice, bob, carol }

    for (const [name, user] of Object.entries(users)) {
      if (!user) {
        console.log(`${name} not found, skipping`)
        continue
      }
      console.log(`${name}: id=${user.id}, email=${user.email}`)
    }

    // Assign roles
    if (alice) await platform.permissionKit.assignRole(alice.id, 'submitter')
    if (bob) await platform.permissionKit.assignRole(bob.id, 'handler')
    if (carol) await platform.permissionKit.assignRole(carol.id, 'handler')
    console.log('Roles assigned')

    // Clear passwordChangeRequired for all users
    for (const user of [alice, bob, carol].filter(Boolean)) {
      await platform.auth.userStore.updatePassword(user.id, platform.auth.hashPassword(PW), true)
      console.log(`Password cleared for ${user.email}`)
    }

    // Verify roles
    if (alice) console.log('Alice roles:', await platform.permissionKit.getRoles(alice.id))
    if (bob) console.log('Bob roles:', await platform.permissionKit.getRoles(bob.id))
    if (carol) console.log('Carol roles:', await platform.permissionKit.getRoles(carol.id))
  } finally {
    await platform.close()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
