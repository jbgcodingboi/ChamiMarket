/**
 * Bundles the sync function (supabase/functions/sync/main.mjs plus the app's
 * own source files it uses) into one file, supabase/functions/sync/index.ts,
 * which is what Supabase deploys. Run by .github/workflows/deploy-sync.yml.
 */
import { rolldown } from 'rolldown'

const bundle = await rolldown({ input: 'supabase/functions/sync/main.mjs', platform: 'neutral' })
await bundle.write({
  file: 'supabase/functions/sync/index.ts',
  format: 'esm',
  banner: '// @ts-nocheck\n// Built by scripts/build-sync-function.mjs from supabase/functions/sync/main.mjs. Do not edit.',
})
await bundle.close()
console.log('built supabase/functions/sync/index.ts')
