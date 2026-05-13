/**
 * Evaluator for a single template variable.
 *
 * @param param  The colon-separated parameter, or null if absent.
 *               Empty string is preserved (distinct from null) so evaluators
 *               can distinguish "explicit empty" from "no parameter".
 */
export type TemplateEvaluator = (param: string | null) => string;

export type TemplateEvaluators = Record<string, TemplateEvaluator>;

// Why this regex shape:
// - Variable names use the C-identifier rule (letter/underscore, then alnum/underscore)
//   so we don't accidentally match `{{ now }}` or `{{1abc}}`.
// - Parameter is everything up to the closing `}}` and is greedy-stopped by `[^}]*`,
//   which keeps the matcher single-line and avoids catastrophic backtracking.
// - The `:` is captured outside the parameter group so we can distinguish:
//     `{{x}}`   -> param group is undefined (=> null)
//     `{{x:}}`  -> param group is '' (=> empty string)
const VARIABLE_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}\}/g;

/**
 * Replaces `{{name}}` / `{{name:param}}` occurrences with the result of the
 * matching evaluator. Unknown variables are left as literal text so user
 * templates don't silently lose content on typos.
 *
 * The output of an evaluator is NOT re-scanned: if it returns `{{x}}`, the
 * literal `{{x}}` is kept. This avoids infinite recursion and keeps the
 * substitution semantics predictable.
 */
export function evaluateTemplate(
  template: string,
  evaluators: TemplateEvaluators,
): string {
  if (!template) return template;

  return template.replace(VARIABLE_PATTERN, (match, name: string, rawParam: string | undefined) => {
    const evaluator = evaluators[name];
    if (!evaluator) {
      return match;
    }
    const param = rawParam === undefined ? null : rawParam;
    return evaluator(param);
  });
}
