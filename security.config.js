/**
 * Content-Security-Policy and security headers, in one place.
 *
 * The build adds the policy as a <meta> tag (all GitHub Pages can do), and
 * vercel.json and netlify.toml send it as real headers along with the
 * header-only extras below. src/utils/security.test.js checks that those
 * files stay in step with this one.
 *
 * connect-src lists every API the browser calls. Market images come from
 * Polymarket's CDN, so img-src allows any https source (an <img> can't run
 * script). Add a host here before fetching from it in the app. The Supabase
 * backend (API and the Realtime websocket) is allowed on *.supabase.co; a
 * build with a custom VITE_SUPABASE_URL adds that origin to the meta tag.
 */
export const API_HOSTS = [
  'https://gamma-api.polymarket.com',
  'https://clob.polymarket.com',
  'https://api.exchange.coinbase.com',
  'https://api.weather.gov',
  'https://site.api.espn.com',
]

export const BACKEND_HOSTS = ['https://*.supabase.co', 'wss://*.supabase.co']

/** The configured backend origin and its websocket twin, when it isn't on *.supabase.co. */
function extraOrigins(url) {
  if (!url) return []
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('.supabase.co')) return []
    return [u.origin, `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`]
  } catch {
    return []
  }
}

const directives = (extra = []) => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  `connect-src 'self' ${[...API_HOSTS, ...BACKEND_HOSTS, ...extra].join(' ')}`,
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
]

/** The policy for a <meta> tag (frame-ancestors only works as a header). */
export const META_CSP = directives().join('; ')

/** The meta policy for a build pointed at a given backend URL. */
export const metaCspFor = (backendUrl) => directives(extraOrigins(backendUrl)).join('; ')

/** Headers for hosts that can send them. */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': `${META_CSP}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}
