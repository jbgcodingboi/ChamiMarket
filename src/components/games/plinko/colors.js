/** Bucket colors: gold in the middle, deepening to red at the rare edges. */
export function bucketColor(k, rows) {
  const d = Math.abs(k - rows / 2) / (rows / 2)
  const hue = 48 - 48 * d
  return {
    d,
    hue,
    fill: `hsl(${hue} 88% ${52 - d * 6}%)`,
    top: `hsl(${hue} 95% ${64 - d * 8}%)`,
    glow: `hsl(${hue} 95% 55%)`,
    text: d > 0.55 ? '#fff' : '#1c1917',
  }
}

export const multLabel = (m) => (m >= 1000 ? `${m / 1000}K` : `${m}`)
