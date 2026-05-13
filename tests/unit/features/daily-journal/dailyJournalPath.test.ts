import {
  createDailyJournalPathEvaluator,
  type DailyJournalPathContext,
} from '../../../../src/features/daily-journal/dailyJournalPath';

// 2026-05-13 (Wed) local. Used as baseDate so offset 0 maps to 260513.
const BASE_DATE = new Date(2026, 4, 13);

const DEFAULT_TEMPLATE = '00_common/09_agent/journal/{{date:YYMMDD}}.md';

const makeCtx = (
  existingPaths: string[] = [],
  overrides: Partial<DailyJournalPathContext> = {},
): DailyJournalPathContext => ({
  pathTemplate: DEFAULT_TEMPLATE,
  baseDate: BASE_DATE,
  vaultOps: {
    exists: (p: string) => existingPaths.includes(p),
  },
  ...overrides,
});

describe('createDailyJournalPathEvaluator', () => {
  describe("today's path (param: null)", () => {
    it("returns today's path when the file exists", () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      expect(evaluate(null)).toBe('00_common/09_agent/journal/260513.md');
    });

    it('returns empty string when the file does not exist', () => {
      const evaluate = createDailyJournalPathEvaluator(makeCtx([]));
      expect(evaluate(null)).toBe('');
    });

    it('treats empty-string param same as today (offset 0)', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      // {{daily_journal_path:}} (colon with empty param) is treated as offset 0.
      expect(evaluate('')).toBe('00_common/09_agent/journal/260513.md');
    });
  });

  describe('single integer offset', () => {
    it('handles positive offset (future day)', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260514.md']),
      );
      expect(evaluate('1')).toBe('00_common/09_agent/journal/260514.md');
    });

    it('returns empty string for negative offset (per design)', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260512.md']),
      );
      expect(evaluate('-1')).toBe('');
    });

    it('returns empty string if the resolved file does not exist', () => {
      const evaluate = createDailyJournalPathEvaluator(makeCtx([]));
      expect(evaluate('1')).toBe('');
    });

    it('rolls over month/year boundary correctly', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260101.md'], {
          baseDate: new Date(2025, 11, 31), // 2025-12-31
        }),
      );
      expect(evaluate('1')).toBe('00_common/09_agent/journal/260101.md');
    });
  });

  describe('range offset (N-M)', () => {
    it('returns a Markdown list of existing files in the range', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx([
          '00_common/09_agent/journal/260513.md',
          '00_common/09_agent/journal/260515.md',
        ]),
      );
      expect(evaluate('0-7')).toBe(
        '- [00_common/09_agent/journal/260513.md](00_common/09_agent/journal/260513.md)\n' +
          '- [00_common/09_agent/journal/260515.md](00_common/09_agent/journal/260515.md)',
      );
    });

    it('returns empty string when no files in the range exist', () => {
      const evaluate = createDailyJournalPathEvaluator(makeCtx([]));
      expect(evaluate('0-7')).toBe('');
    });

    it('skips negative offsets within a range', () => {
      // -3 .. 3 should only consider offsets 0, 1, 2, 3.
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      expect(evaluate('-3-3')).toBe(
        '- [00_common/09_agent/journal/260513.md](00_common/09_agent/journal/260513.md)',
      );
    });

    it('returns empty string for an inverted range (start > end)', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      expect(evaluate('5-3')).toBe('');
    });

    it('treats N-N as a single-day range', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      expect(evaluate('0-0')).toBe(
        '- [00_common/09_agent/journal/260513.md](00_common/09_agent/journal/260513.md)',
      );
    });
  });

  describe('invalid parameter', () => {
    it('returns empty string for non-numeric junk', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      expect(evaluate('garbage')).toBe('');
    });

    it('returns empty string for malformed range', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['00_common/09_agent/journal/260513.md']),
      );
      expect(evaluate('1-2-3')).toBe('');
    });
  });

  describe('path template integration', () => {
    it('honours a custom path template using the date evaluator', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['logs/2026-05-13.md'], {
          pathTemplate: 'logs/{{date:YYYY-MM-DD}}.md',
        }),
      );
      expect(evaluate(null)).toBe('logs/2026-05-13.md');
    });

    it('honours a path template with mixed tokens', () => {
      const evaluate = createDailyJournalPathEvaluator(
        makeCtx(['journal/2026/05/13.md'], {
          pathTemplate: 'journal/{{date:YYYY}}/{{date:MM}}/{{date:DD}}.md',
        }),
      );
      expect(evaluate(null)).toBe('journal/2026/05/13.md');
    });
  });
});
