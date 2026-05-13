import { formatDate } from '../../utils/date';
import { evaluateTemplate, type TemplateEvaluator } from '../../utils/templateVariables';

/**
 * Minimal Vault interface used by the daily-journal path evaluator.
 *
 * Kept narrow on purpose so unit tests can supply a plain object without
 * pulling in Obsidian's `App`/`Vault` types.
 */
export interface VaultOps {
  exists(path: string): boolean;
}

export interface DailyJournalPathContext {
  /** Path template, e.g. `00_common/09_agent/journal/{{date:YYMMDD}}.md`. */
  pathTemplate: string;
  /** Reference date for offset 0 — typically `new Date()` at evaluation time. */
  baseDate: Date;
  /** Used to decide whether a resolved path actually exists in the vault. */
  vaultOps: VaultOps;
}

/**
 * Resolve a single path for `baseDate + offsetDays`.
 *
 * Returns the resolved path string if the file exists, or `''` if it
 * doesn't (or if the template produced no recognizable path). Existence
 * filtering happens here so callers don't need to repeat it.
 */
function resolvePath(ctx: DailyJournalPathContext, offsetDays: number): string {
  const target = new Date(ctx.baseDate);
  target.setDate(target.getDate() + offsetDays);

  const path = evaluateTemplate(ctx.pathTemplate, {
    date: (param) => formatDate(target, param ?? ''),
  });

  if (!path) return '';
  return ctx.vaultOps.exists(path) ? path : '';
}

/**
 * Format a list of paths as a Markdown bullet list of links.
 * Caller passes paths that have already been existence-filtered.
 */
function formatPathList(paths: string[]): string {
  return paths.map((p) => `- [${p}](${p})`).join('\n');
}

// "N" or "-N" — leading minus allowed; we reject it later for single form.
const SINGLE_INT_PATTERN = /^-?\d+$/;
// "N-M" — both sides can be signed integers.
const RANGE_PATTERN = /^(-?\d+)-(-?\d+)$/;

/**
 * Build a `TemplateEvaluator` for `{{daily_journal_path}}`.
 *
 * Parameter semantics:
 *   - `null` or `""`  -> today (offset 0)
 *   - `"N"`           -> single day at offset N (negative -> empty string)
 *   - `"N-M"`         -> Markdown list of existing files from offset N..M
 *                        (negatives skipped within the range; inverted ranges -> empty)
 *   - anything else   -> empty string (graceful failure rather than throwing,
 *                        because this runs on every user message)
 */
/**
 * Resolve a daily-journal path for `date`, given a template like
 * `00_common/09_agent/journal/{{date:YYMMDD}}.md`. Existence is NOT
 * checked here — callers that need to *append* into the file want the
 * path even when it doesn't yet exist.
 */
export function resolveJournalPath(pathTemplate: string, date: Date): string {
  if (!pathTemplate) return '';
  return evaluateTemplate(pathTemplate, {
    date: (param) => formatDate(date, param ?? ''),
  });
}

export function createDailyJournalPathEvaluator(
  ctx: DailyJournalPathContext,
): TemplateEvaluator {
  return (param: string | null): string => {
    if (param === null || param === '') {
      return resolvePath(ctx, 0);
    }

    const rangeMatch = param.match(RANGE_PATTERN);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start > end) return '';

      const paths: string[] = [];
      for (let i = start; i <= end; i++) {
        if (i < 0) continue;
        const p = resolvePath(ctx, i);
        if (p) paths.push(p);
      }
      return formatPathList(paths);
    }

    if (SINGLE_INT_PATTERN.test(param)) {
      const offset = parseInt(param, 10);
      if (offset < 0) return '';
      return resolvePath(ctx, offset);
    }

    return '';
  };
}
