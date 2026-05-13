/**
 * Claudian - Date Utilities
 *
 * Date formatting helpers for system prompts.
 */

/** Returns today's date in readable and ISO format for the system prompt. */
export function getTodayDate(): string {
  const now = new Date();
  const readable = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const iso = now.toISOString().split('T')[0];
  return `${readable} (${iso})`;
}

/**
 * Format tokens for {@link formatDate}.
 *
 * Tokens are evaluated by regex with left-to-right alternation, so longer
 * tokens (YYYY) must come before their shorter counterparts (YY) to avoid
 * being shadowed. The pair `MM` (month) / `mm` (minute) is intentionally
 * case-sensitive.
 */
const DATE_FORMAT_TOKEN = /YYYY|YY|MM|DD|HH|mm|ss/g;

/** Default pattern used when none is supplied. */
const DEFAULT_DATE_PATTERN = 'YYYY-MM-DD HH:mm:ss';

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/**
 * Formats a Date using a token pattern. Supports:
 *   YYYY (4-digit year), YY (2-digit year),
 *   MM (month), DD (day), HH (hour), mm (minute), ss (second).
 *
 * Returns an empty string for an empty pattern or an invalid Date — we
 * never want `NaN-NaN-NaN` leaking into LLM prompts.
 */
export function formatDate(date: Date, pattern: string = DEFAULT_DATE_PATTERN): string {
  if (pattern === '') return '';
  if (Number.isNaN(date.getTime())) return '';

  const fullYear = date.getFullYear();
  const tokens: Record<string, string> = {
    YYYY: fullYear.toString(),
    YY: pad2(fullYear % 100),
    MM: pad2(date.getMonth() + 1),
    DD: pad2(date.getDate()),
    HH: pad2(date.getHours()),
    mm: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds()),
  };

  return pattern.replace(DATE_FORMAT_TOKEN, (match) => tokens[match]);
}

/** Formats a duration in seconds as "1m 23s" or "45s". */
export function formatDurationMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0s';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}
