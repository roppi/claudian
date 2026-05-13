import {
  applyUserPromptTemplate,
  type UserPromptTemplateDeps,
  type UserPromptTemplateSettings,
} from '../../../../src/features/chat/userPromptTemplate';

const FIXED_NOW = new Date(2026, 4, 13, 8, 35, 0); // 2026-05-13 08:35:00 local

const DEFAULT_PATH_TEMPLATE = '00_common/09_agent/journal/{{date:YYMMDD}}.md';

const makeSettings = (
  overrides: Partial<UserPromptTemplateSettings> = {},
): UserPromptTemplateSettings => ({
  enableUserPromptTemplate: true,
  userPromptTemplate: '',
  dailyJournalPathTemplate: DEFAULT_PATH_TEMPLATE,
  ...overrides,
});

const makeDeps = (
  existingPaths: string[] = [],
  now: Date = FIXED_NOW,
): UserPromptTemplateDeps => ({
  vaultOps: { exists: (p: string) => existingPaths.includes(p) },
  now,
});

describe('applyUserPromptTemplate', () => {
  describe('feature disabled / template empty', () => {
    it('returns raw text when enableUserPromptTemplate is false', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ enableUserPromptTemplate: false, userPromptTemplate: '[{{now}}] {{user_prompt}}' }),
        makeDeps(),
      );
      expect(out).toBe('hello');
    });

    it('returns raw text when userPromptTemplate is empty', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '' }),
        makeDeps(),
      );
      expect(out).toBe('hello');
    });
  });

  describe('basic variable substitution', () => {
    it('substitutes {{user_prompt}}', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: 'prefix: {{user_prompt}}' }),
        makeDeps(),
      );
      expect(out).toBe('prefix: hello');
    });

    it('substitutes {{now}} with the default pattern', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '[{{now}}] {{user_prompt}}' }),
        makeDeps(),
      );
      expect(out).toBe('[2026-05-13 08:35:00] hello');
    });

    it('substitutes {{now}} with a custom pattern', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '{{now:YYYY/MM/DD}} {{user_prompt}}' }),
        makeDeps(),
      );
      expect(out).toBe('2026/05/13 hello');
    });

    it("substitutes {{daily_journal_path}} with today's existing file", () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({
          userPromptTemplate: '{{user_prompt}}\n\nToday: {{daily_journal_path}}',
        }),
        makeDeps(['00_common/09_agent/journal/260513.md']),
      );
      expect(out).toBe(
        'hello\n\nToday: 00_common/09_agent/journal/260513.md',
      );
    });

    it('substitutes {{daily_journal_path}} as empty when the file does not exist', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({
          userPromptTemplate: '{{user_prompt}} / today: {{daily_journal_path}}',
        }),
        makeDeps([]),
      );
      expect(out).toBe('hello / today: ');
    });
  });

  describe('E-2 fallback: {{user_prompt}} missing from template', () => {
    it('appends raw text at the end when {{user_prompt}} is absent', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '[{{now}}]' }),
        makeDeps(),
      );
      // E-2: user input must not be lost when the user forgot {{user_prompt}}.
      expect(out).toBe('[2026-05-13 08:35:00]\n\nhello');
    });

    it('does not append raw text when {{user_prompt}} is present', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '[{{now}}]\n{{user_prompt}}' }),
        makeDeps(),
      );
      expect(out).toBe('[2026-05-13 08:35:00]\nhello');
    });

    it('treats {{user_prompt:any}} (with parameter) as present', () => {
      // Even if a user adds a colon param (we don't act on it), the presence
      // check should still pass — don't double-append in that case.
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '{{user_prompt:whatever}} [{{now}}]' }),
        makeDeps(),
      );
      expect(out).toBe('hello [2026-05-13 08:35:00]');
    });
  });

  describe('user-input safety', () => {
    it('does not re-evaluate {{...}} patterns inside the user input', () => {
      // If the user types something that looks like a template variable,
      // it must reach the SDK verbatim — no recursive expansion.
      const out = applyUserPromptTemplate(
        'help me with {{now}}',
        makeSettings({ userPromptTemplate: '{{user_prompt}}' }),
        makeDeps(),
      );
      expect(out).toBe('help me with {{now}}');
    });
  });

  describe('unknown variables', () => {
    it('leaves unknown variables literal (no silent loss)', () => {
      const out = applyUserPromptTemplate(
        'hello',
        makeSettings({ userPromptTemplate: '{{user_prompt}} {{unknown}}' }),
        makeDeps(),
      );
      expect(out).toBe('hello {{unknown}}');
    });
  });
});
