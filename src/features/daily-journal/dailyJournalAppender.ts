import { containsConvId, insertEntry, replaceTitleInEntry } from './dailyJournalInsert';

/**
 * Minimal vault interface needed by the appender.
 *
 * Kept narrow so unit tests can supply a fake object without dragging in
 * Obsidian's full `App`/`Vault` types. The integration layer (`main.ts`
 * hook) is responsible for adapting `app.vault` to this shape.
 */
export interface JournalVault {
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  create(path: string, content: string): Promise<void>;
  modify(path: string, content: string): Promise<void>;
}

export interface AppendJournalEntryParams {
  vault: JournalVault;
  /** Absolute-from-vault path of the daily journal file. */
  filePath: string;
  /** Section marker (e.g. `"## Sessions"`); `""` means "append at file end". */
  sectionMarker: string;
  /** The fully-formatted entry line (no trailing newline). */
  entry: string;
  /** Used for the duplicate-prevention check. */
  convId: string;
  /** Sleep implementation; injectable so tests can resolve immediately. */
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds to wait after creating an empty file (lets Templater run). */
  templaterWaitMs?: number;
}

// 500ms was chosen empirically: 200ms was too short on at least one Windows
// real-vault test where Templater's on_file_creation hook hadn't finished
// writing the folder template before Claudian re-read the file. Because
// this appender runs fire-and-forget from sendMessage, longer waits don't
// delay user-visible UX.
const DEFAULT_TEMPLATER_WAIT_MS = 500;
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Append a daily-journal entry to `filePath`.
 *
 * Lifecycle:
 *   1. If the file doesn't exist, create it empty and wait `templaterWaitMs`
 *      so that Templater (if configured) can run its `on_file_creation`
 *      hook and fill in a folder template.
 *   2. After the wait, re-read the file. If it's still empty AND a
 *      `sectionMarker` is configured, write just the marker line (F-9
 *      fallback). If `sectionMarker` is `""`, write nothing — Claudian
 *      never authors structure (F-1 / F-2: structure is the user's
 *      responsibility).
 *   3. Skip silently if `convId` already appears in the file
 *      (duplicate-prevention; matters on SDK resume / reload).
 *   4. Insert the entry into the marker section, or append at end-of-file
 *      when no marker is configured.
 */
export async function appendJournalEntry(params: AppendJournalEntryParams): Promise<void> {
  const {
    vault,
    filePath,
    sectionMarker,
    entry,
    convId,
  } = params;
  const sleep = params.sleep ?? defaultSleep;
  const waitMs = params.templaterWaitMs ?? DEFAULT_TEMPLATER_WAIT_MS;

  let content: string;
  if (!vault.exists(filePath)) {
    await vault.create(filePath, '');
    await sleep(waitMs);
    content = await vault.read(filePath);
    if (content === '' && sectionMarker !== '') {
      // Templater didn't run (or no folder template configured). Write the
      // minimal marker line so insertEntry has somewhere to anchor.
      content = `${sectionMarker}\n`;
      await vault.modify(filePath, content);
    }
  } else {
    content = await vault.read(filePath);
  }

  if (containsConvId(content, convId)) return;

  const next = insertEntry(content, sectionMarker, entry);
  if (next === content) return;
  await vault.modify(filePath, next);
}

export interface UpdateJournalEntryTitleParams {
  vault: JournalVault;
  filePath: string;
  convId: string;
  newTitle: string;
}

/**
 * Swap the title of an existing journal entry for `convId`. Used when the
 * AI-generated title arrives after the entry has already been appended with
 * the "（タイトル生成中）" placeholder.
 *
 * Silently does nothing when the file or the conv-id can't be found, so
 * this is safe to call from a title-generation callback that might fire
 * after the user has deleted/renamed the journal.
 */
export async function updateJournalEntryTitle(
  params: UpdateJournalEntryTitleParams,
): Promise<void> {
  const { vault, filePath, convId, newTitle } = params;
  if (!vault.exists(filePath)) return;
  const content = await vault.read(filePath);
  if (!content) return;
  const next = replaceTitleInEntry(content, convId, newTitle);
  if (next === content) return;
  await vault.modify(filePath, next);
}
