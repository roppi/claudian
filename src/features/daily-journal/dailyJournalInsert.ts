/**
 * Pure helpers for inserting an entry line into a daily-journal file.
 *
 * No I/O — these functions just transform strings. The unsafe wrapper that
 * touches the Obsidian vault lives in a separate module (the appender).
 */

/**
 * Strict containment check for a conversation id.
 *
 * We avoid `String.includes` alone because callers may pass a prefix
 * (e.g. `conv-ABC`) that would falsely match `conv-ABC123`. The id pattern
 * `conv-XXX-YYY` from Claudian uses alphanumerics and hyphens after the
 * `conv-` prefix, so we require a boundary char (anything that isn't a hex
 * digit, letter, or hyphen) — or end of string — right after the id.
 */
export function containsConvId(content: string, convId: string): boolean {
  if (!content || !convId) return false;
  const escaped = convId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Boundary: any non-identifier character (anything outside [A-Za-z0-9_-]).
  return new RegExp(`${escaped}(?![A-Za-z0-9_-])`).test(content);
}

/**
 * Inserts an entry line into `content`.
 *
 * - When `marker` is empty, the entry is appended at end-of-file.
 * - When `marker` is present in `content`, the entry is inserted at the
 *   end of that section. The section ends at the next heading-like line
 *   (`/^#+\s/`) or end-of-file.
 * - When `marker` is non-empty but not present, falls back to end-of-file
 *   (we never auto-insert the marker — F-2 says Claudian doesn't write
 *   structure; the F-9 fallback handles marker creation when the file
 *   itself was just created empty).
 *
 * The result always ends with a single trailing newline (per the appended
 * entry's `\n`). Existing blank lines around the insertion point are
 * preserved as written.
 */
export function insertEntry(content: string, marker: string, entry: string): string {
  if (!marker) {
    return appendAtEnd(content, entry);
  }

  const markerIdx = content.indexOf(marker);
  if (markerIdx === -1) {
    return appendAtEnd(content, entry);
  }

  // Look for the next heading line strictly after the marker's line.
  const markerLineEnd = content.indexOf('\n', markerIdx);
  const searchStart = markerLineEnd === -1 ? content.length : markerLineEnd + 1;
  const nextHeading = content.slice(searchStart).search(/^#+\s/m);
  const sectionEnd = nextHeading === -1 ? content.length : searchStart + nextHeading;

  const before = content.slice(0, sectionEnd).replace(/\n+$/, '');
  const after = content.slice(sectionEnd);

  if (after) {
    // Ensure a blank line between the inserted entry and the next heading.
    return `${before}\n${entry}\n\n${after}`;
  }
  return `${before}\n${entry}\n`;
}

function appendAtEnd(content: string, entry: string): string {
  if (!content) return `${entry}\n`;
  const trimmed = content.replace(/\n+$/, '');
  return `${trimmed}\n${entry}\n`;
}

/**
 * Replaces just the title portion of the matching entry line, preserving the
 * HH:MM prefix, an optional `(↳ M/D HH:MM)` cross-day label, and the
 * `[conv-XXX](path)` link verbatim.
 *
 * Used by the title-confirmation callback to swap the
 * "（タイトル生成中）" placeholder for the AI-resolved title without
 * having to remember the original write time.
 */
export function replaceTitleInEntry(
  content: string,
  convId: string,
  newTitle: string,
): string {
  if (!content || !convId) return content;
  const escaped = convId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Capture everything up to ") " right after the conv-id link, then swap
  // whatever follows on the same line.
  const pattern = new RegExp(
    `(^[^\\n]*\\[${escaped}(?![A-Za-z0-9_-])[^\\]]*\\]\\([^)]*\\) )[^\\n]*$`,
    'm',
  );
  if (!pattern.test(content)) return content;
  return content.replace(pattern, `$1${newTitle}`);
}

/**
 * Replaces the first line containing `convId` with `newEntry`, preserving
 * surrounding lines verbatim. Used by the title-confirmation callback to
 * swap a "（タイトル生成中）" placeholder line for the resolved entry —
 * regenerating the whole line keeps the logic agnostic to optional
 * elements like the cross-day label.
 *
 * Returns `content` unchanged when the id is not present, so callers can
 * detect "no-op" by reference equality.
 *
 * Uses the same boundary rule as `containsConvId` to avoid prefix collisions.
 */
export function replaceEntryLine(
  content: string,
  convId: string,
  newEntry: string,
): string {
  if (!content || !convId) return content;
  const escaped = convId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match a full line (no newline inside) that contains the boundary-safe id.
  const linePattern = new RegExp(
    `^[^\\n]*${escaped}(?![A-Za-z0-9_-])[^\\n]*$`,
    'm',
  );
  if (!linePattern.test(content)) return content;
  return content.replace(linePattern, newEntry);
}
