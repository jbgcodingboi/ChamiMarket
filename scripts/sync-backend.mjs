/**
 * Runs one sync (scripts/sync-core.mjs) from the command line. Needs
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; without them it exits quietly.
 * The scheduled sync runs the same code in supabase/functions/sync.
 */
import { runSync } from './sync-core.mjs'

const BASE = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!BASE || !KEY) {
  console.log('sync skipped: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set')
  process.exit(0)
}
// The service key must only ever travel over https (plain http is allowed for a local test server).
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error('sync stopped: SUPABASE_URL must start with https://')
  process.exit(1)
}

const { failed } = await runSync({ base: BASE, key: KEY })
if (failed) process.exitCode = 1
