import { formatDate } from '../../utils/date';
import { evaluateTemplate, type TemplateEvaluators } from '../../utils/templateVariables';
import {
  createDailyJournalPathEvaluator,
  type VaultOps,
} from '../daily-journal/dailyJournalPath';

/**
 * Subset of {@link ClaudianSettings} the template engine needs.
 *
 * We accept a narrow shape rather than the full settings object so this module
 * stays testable without spinning up an Obsidian plugin instance.
 */
export interface UserPromptTemplateSettings {
  enableUserPromptTemplate: boolean;
  userPromptTemplate: string;
  dailyJournalPathTemplate: string;
}

export interface UserPromptTemplateDeps {
  vaultOps: VaultOps;
  /** Current time at evaluation. Passed in so tests can be deterministic. */
  now: Date;
}

/** Default `{{now}}` pattern when none is supplied via `{{now:...}}`. */
const DEFAULT_NOW_PATTERN = 'YYYY-MM-DD HH:mm:ss';

// Detects whether the template contains a {{user_prompt}} variable
// (with or without colon parameter). Used for the E-2 fallback decision.
const USER_PROMPT_PATTERN = /\{\{user_prompt(?::[^}]*)?\}\}/;

/**
 * Apply the user-prompt template to a raw user message.
 *
 * Returns the text that will be handed to the SDK. The caller is responsible
 * for keeping the original `rawText` separately for UI display.
 *
 * Design notes:
 *   - When the feature is disabled or the template is empty, raw text is
 *     returned unchanged.
 *   - Unknown variables are left as literal text (see `evaluateTemplate`).
 *   - The `{{user_prompt}}` evaluator returns `rawText` as a single
 *     substitution; the engine itself does not re-scan evaluator output,
 *     so any `{{...}}` the user typed reaches the SDK verbatim.
 *   - E-2 fallback: if the template does not reference `{{user_prompt}}`,
 *     we append the raw text at the end so the user's actual input is
 *     never silently lost. Detection happens on the *template string* (not
 *     the evaluated output) so it can't be fooled by an empty evaluation.
 */
export function applyUserPromptTemplate(
  rawText: string,
  settings: UserPromptTemplateSettings,
  deps: UserPromptTemplateDeps,
): string {
  if (!settings.enableUserPromptTemplate) return rawText;
  if (!settings.userPromptTemplate) return rawText;

  const template = settings.userPromptTemplate;
  const templateHasUserPrompt = USER_PROMPT_PATTERN.test(template);

  const evaluators: TemplateEvaluators = {
    now: (param) => formatDate(deps.now, param ?? DEFAULT_NOW_PATTERN),
    daily_journal_path: createDailyJournalPathEvaluator({
      pathTemplate: settings.dailyJournalPathTemplate,
      baseDate: deps.now,
      vaultOps: deps.vaultOps,
    }),
    user_prompt: () => rawText,
  };

  const evaluated = evaluateTemplate(template, evaluators);

  if (!templateHasUserPrompt) {
    return `${evaluated}\n\n${rawText}`;
  }
  return evaluated;
}
