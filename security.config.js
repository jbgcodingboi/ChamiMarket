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
 * script). Add a host here before fetching from it in the app.
 */
export const API_HOSTS = [
  'https://gamma-api.polymarket.com',
  'https://clob.polymarket.com',
  'https://api.exchange.coinbase.com',
  'https://api.weather.gov',
  'https://site.api.espn.com',
]

const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  `connect-src 'self' ${API_HOSTS.join(' ')}`,
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
]

/** The policy for a <meta> tag (frame-ancestors only works as a header). */
export const META_CSP = DIRECTIVES.join('; ')

/** Headers for hosts that can send them. */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': `${META_CSP}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}
