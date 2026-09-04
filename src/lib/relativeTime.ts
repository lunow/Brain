/** Coarse "X ago" formatting for timestamps (ms since epoch), e.g. for the
 *  left sidebar's "last change" summary. */
export function formatRelativeTime(ms: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));

  if (diffSeconds < 60) return "just now";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
