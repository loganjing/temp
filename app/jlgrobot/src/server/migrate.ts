import 'dotenv/config'
import { initializePlatform } from './platform/bootstrap'

const platform = await initializePlatform()
console.log('[jlgrobot] migrations applied successfully')
await platform.close()
