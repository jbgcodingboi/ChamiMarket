/**
 * Reads an encrypted feedback report from the "Admin - feedback report"
 * workflow.
 *
 *   node scripts/decrypt-feedback.mjs keys <dir>            makes <dir>/feedback.key and prints the public key to paste
 *   node scripts/decrypt-feedback.mjs read <dir> <log.txt>  decrypts the report found in a saved run log
 *
 * Keep feedback.key private and out of the repository.
 */
import { constants, createDecipheriv, createPrivateKey, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [cmd, dir, logFile] = process.argv.slice(2)

if (cmd === 'keys' && dir) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 })
  mkdirSync(dir, { recursive: true })
  // 'wx' refuses to replace an existing key, which would make older reports unreadable.
  writeFileSync(join(dir, 'feedback.key'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' })
  console.log(Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'))
} else if (cmd === 'read' && dir && logFile) {
  const log = readFileSync(logFile, 'utf8')
  const body = log.split('-----BEGIN ENCRYPTED FEEDBACK-----')[1]?.split('-----END ENCRYPTED FEEDBACK-----')[0]
  if (!body) throw new Error('No encrypted report in that log.')
  // Log lines may carry timestamps; keep only the base64 part of each line.
  const blob = body
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop() ?? '')
    .filter((l) => /^[A-Za-z0-9+/=]+$/.test(l))
    .join('')
  const r = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
  const key = privateDecrypt(
    { key: createPrivateKey(readFileSync(join(dir, 'feedback.key'))), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(r.key, 'base64'),
  )
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(r.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(r.tag, 'base64'))
  const rows = JSON.parse(Buffer.concat([decipher.update(Buffer.from(r.data, 'base64')), decipher.final()]).toString('utf8'))
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log('Usage: node scripts/decrypt-feedback.mjs keys <dir> | read <dir> <log.txt>')
  process.exit(1)
}
