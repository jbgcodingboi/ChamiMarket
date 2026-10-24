/**
 * The scheduled sync, as a Supabase Edge Function. The database calls it every
 * 5 minutes (private.dispatch_sync in supabase/schema.sql); it runs the same
 * code as scripts/sync-backend.mjs with this project's own URL and service
 * role key, which Supabase provides to every function.
 *
 * It takes no key and reads nothing from the request: public.sync_claim lets
 * a run start at most once every 4 minutes, so extra calls do nothing.
 *
 * Built into index.ts by scripts/build-sync-function.mjs and deployed by
 * .github/workflows/deploy-sync.yml.
 */
import { runSync } from '../../../scripts/sync-core.mjs'

const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

async function claim() {
  const res = await fetch(`${base}/rest/v1/rpc/sync_claim`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`sync_claim: HTTP ${res.status}`)
  return (await res.json()) === true
}

async function run() {
  try {
    const { failed } = await runSync({ base, key })
    if (failed) console.error('sync finished with errors')
  } catch (err) {
    console.error(`sync failed: ${err.message}`)
  }
}

Deno.serve(async () => {
  if (!base || !key) return new Response('not configured', { status: 500 })
  if (!(await claim().catch(() => false))) return new Response('skipped: a sync started less than 4 minutes ago')
  // Answer right away and keep running, so the database's call never waits on the whole sync.
  if (globalThis.EdgeRuntime?.waitUntil) {
    globalThis.EdgeRuntime.waitUntil(run())
    return new Response('started', { status: 202 })
  }
  await run()
  return new Response('done')
})
