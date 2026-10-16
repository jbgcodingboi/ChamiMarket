/**
 * Exports feedback for the site owner's review. Run by
 * .github/workflows/admin-feedback-report.yml with the service role key.
 *
 * The repository's Action logs are public, so messages are never printed in
 * plain text: they are encrypted to the RSA public key passed in PUBLIC_KEY
 * (base64 of a PEM) with RSA-OAEP and AES-256-GCM, and only whoever holds the
 * matching private key can read them. The owner can always read feedback
 * directly in the Supabase Table Editor too.
 *
 *   PUBLIC_KEY=... STATUS=new MARK_REVIEWED=false SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/admin-feedback-report.mjs
 */
import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto'

const BASE = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const STATUS = process.env.STATUS === 'all' ? 'all' : 'new'
const MARK = process.env.MARK_REVIEWED === 'true'

const stop = (msg) => {
  console.error(msg)
  process.exit(1)
}
if (!BASE || !KEY) stop('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) stop('SUPABASE_URL must start with https://')

let publicKey
try {
  publicKey = createPublicKey(Buffer.from(process.env.PUBLIC_KEY ?? '', 'base64').toString('utf8'))
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 2048) throw new Error('weak')
} catch {
  stop('Give a base64 RSA public key (2048 bits or more) in PUBLIC_KEY. Feedback is never printed unencrypted.')
}

const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') && { Authorization: `Bearer ${KEY}` }) }
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  const text = await res.text()
  if (!res.ok) stop(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// New messages oldest first (to work through them in order); "all" newest first. At most 500 per report.
const LIMIT = 500
const query = STATUS === 'new' ? '&status=eq.new&order=created_at.asc' : '&order=created_at.desc'
const rows = await call('GET', `/rest/v1/feedback?select=id,created_at,username,category,page,status,message&limit=${LIMIT}${query}`)
console.log(`${rows.length} ${STATUS === 'new' ? 'new ' : ''}feedback message${rows.length === 1 ? '' : 's'}.`)
if (rows.length === LIMIT) console.log(`Only the first ${LIMIT} are in this report; run it again after marking them reviewed for the rest.`)

const aesKey = randomBytes(32)
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', aesKey, iv)
const data = Buffer.concat([cipher.update(JSON.stringify(rows), 'utf8'), cipher.final()])
const blob = Buffer.from(
  JSON.stringify({
    v: 1,
    key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey).toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }),
).toString('base64')
console.log('-----BEGIN ENCRYPTED FEEDBACK-----')
for (let i = 0; i < blob.length; i += 800) console.log(blob.slice(i, i + 800))
console.log('-----END ENCRYPTED FEEDBACK-----')

if (MARK && rows.length) {
  const ids = rows.filter((r) => r.status === 'new').map((r) => r.id)
  for (let i = 0; i < ids.length; i += 100) await call('PATCH', `/rest/v1/feedback?id=in.(${ids.slice(i, i + 100).join(',')})`, { status: 'reviewed' })
  console.log(`Marked ${ids.length} as reviewed.`)
}
