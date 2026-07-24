/**
 * Coarse relative-time formatter for transcript UI. Buckets:
 *   0-59s  → "Ns" (or "now" if <1s)
 *   1-59m  → "Nm"
 *   1-23h  → "Nh"
 *   1-6d   → "Nd"
 *   ≥7d    → "Nw"
 *
 * Negative deltas (a message dated in the future) return "now" so we never
 * render a nonsensical "-3s" bucket.
 */
export function relTime(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 1_000) return "now";
  const s = Math.floor(deltaMs / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}
