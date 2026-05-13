/**
 * Pure helpers for shaping daily-journal entry lines.
 *
 * No I/O, no Obsidian dependency — this module is fully unit-testable.
 */

/**
 * Placeholder used as the journal entry title before the AI-generated title
 * arrives. Kept as a fixed English string so it sorts cleanly in journal
 * scans regardless of locale, and is replaced verbatim by
 * `updateJournalEntryTitle` once the title-generation callback fires.
 */
export const TITLE_PENDING_PLACEHOLDER = 'Start Session';

export interface JournalEntryParams {
  /** Conversation creation time (local). The HH:MM prefix is derived from this. */
  time: Date;
  /** Conversation id, e.g. "conv-1778573720786-r0xc1tpxl". */
  convId: string;
  /** Absolute path to the SDK-native jsonl session file. */
  jsonlPath: string;
  /**
   * Title for the entry. Pass {@link TITLE_PENDING_PLACEHOLDER} when the
   * AI-generated title is still pending.
   */
  title: string;
  /**
   * If set, the Conv being recorded continues from a session that started
   * before today's 00:00. A `(↳ M/D HH:MM)` label is inserted right after
   * the HH:MM prefix.
   */
  continuedFrom?: Date;
}

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/**
 * Build a Markdown bullet entry line. Title is always positioned at the
 * end of the line so that title-confirmation rewrites can match a simple
 * "prefix-then-title" pattern, independent of cross-day label presence.
 *
 * The cross-day label uses non-padded M/D (per design) to keep it short.
 */
export function formatJournalEntry(params: JournalEntryParams): string {
  const { time, convId, jsonlPath, title, continuedFrom } = params;
  const hhmm = `${pad2(time.getHours())}:${pad2(time.getMinutes())}`;
  const label = continuedFrom
    ? ` (↳ ${continuedFrom.getMonth() + 1}/${continuedFrom.getDate()} ${pad2(continuedFrom.getHours())}:${pad2(continuedFrom.getMinutes())})`
    : '';
  return `- ${hhmm}${label} [${convId}](${jsonlPath}) ${title}`;
}

/**
 * Returns true when `createdAt` falls before midnight of the day implied by
 * `referenceNow`. The 00:00 boundary is treated as "today" (inclusive).
 *
 * Used to decide whether to attach the `(↳ ...)` cross-day label.
 */
export function isCrossDayContinuation(createdAt: Date, referenceNow: Date): boolean {
  const startOfToday = new Date(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate(),
    0, 0, 0, 0,
  );
  return createdAt.getTime() < startOfToday.getTime();
}
