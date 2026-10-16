/**
 * Deletes one player and everything tied to them, for the site owner.
 * Run by .github/workflows/admin-delete-player.yml with the service role key:
 *
 *   PLAYER=someone SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/admin-delete-player.mjs
 *
 * It finds the profile by username, then deletes the login through the
 * Supabase Auth admin API. The profile, portfolio, positions, history, game
 * rounds and state, seeds, recovery codes, snapshots and feed entries all
 * cascade from auth.users, so the player also leaves the leaderboard.
 */
import { readFileSync } from 'node:fs'

const BASE = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
/**
 * The username comes from the workflow's dispatch inputs (read from the event
 * file, so it never appears in a step's env list in the public log), or from
 * PLAYER when run by hand.
 */
function playerName() {
  if (process.env.PLAYER) return process.env.PLAYER.trim()
  try {
    return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).inputs?.username?.trim()
  } catch {
    return undefined
  }
}
const PLAYER = playerName()

const stop = (msg) => {
  console.error(msg)
  process.exit(1)
}
if (!BASE || !KEY) stop('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) stop('SUPABASE_URL must start with https://')
if (!PLAYER || !/^[A-Za-z0-9_.+-]{1,20}$/.test(PLAYER)) stop('Give a valid username in PLAYER.')

// Legacy service_role keys are JWTs and go in both headers; newer sb_secret_ keys go in apikey only.
const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') && { Authorization: `Bearer ${KEY}` }) }

async function call(method, path) {
  const res = await fetch(`${BASE}${path}`, { method, headers, signal: AbortSignal.timeout(15000) })
  const text = await res.text()
  if (!res.ok) stop(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const findProfile = async () => (await call('GET', `/rest/v1/profiles?select=id,username&username=eq.${encodeURIComponent(PLAYER)}`))[0] ?? null

const profile = await findProfile()
if (!profile) {
  // The repository's logs are public, so neither the name nor the id is printed.
  console.log('No player with that username. Nothing to delete.')
  process.exit(0)
}
console.log('Deleting the player and all of their data...')
await call('DELETE', `/auth/v1/admin/users/${profile.id}`)

if (await findProfile()) stop('The player is still there. Check the Supabase dashboard.')
const leftovers = await call('GET', `/rest/v1/portfolios?select=user_id&user_id=eq.${profile.id}`)
if (leftovers.length) stop('The login is gone but a portfolio remains. Check the Supabase dashboard.')
console.log('Done: the player is deleted, along with their portfolio, trades, games, feedback and leaderboard entries.')
