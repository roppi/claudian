import { evaluateTemplate } from '../../../src/utils/templateVariables';

describe('evaluateTemplate', () => {
  describe('basic parsing', () => {
    it('returns empty string for empty template', () => {
      expect(evaluateTemplate('', {})).toBe('');
    });

    it('returns the template as-is when no variables are present', () => {
      expect(evaluateTemplate('hello world', {})).toBe('hello world');
    });

    it('replaces a known variable with the evaluator result', () => {
      expect(
        evaluateTemplate('hello {{name}}', {
          name: () => 'Hiro',
        }),
      ).toBe('hello Hiro');
    });

    it('passes the parameter to the evaluator (colon-separated)', () => {
      const captured: Array<string | null> = [];
      evaluateTemplate('{{now:YYYY-MM-DD}}', {
        now: (param) => {
          captured.push(param);
          return 'date';
        },
      });
      expect(captured).toEqual(['YYYY-MM-DD']);
    });

    it('passes null when no colon is present', () => {
      const captured: Array<string | null> = [];
      evaluateTemplate('{{now}}', {
        now: (param) => {
          captured.push(param);
          return 'date';
        },
      });
      expect(captured).toEqual([null]);
    });

    it('passes an empty string when colon is present but parameter is empty', () => {
      const captured: Array<string | null> = [];
      evaluateTemplate('{{now:}}', {
        now: (param) => {
          captured.push(param);
          return 'date';
        },
      });
      expect(captured).toEqual(['']);
    });

    it('leaves unknown variables as literal text', () => {
      expect(evaluateTemplate('hello {{unknown}}', {})).toBe('hello {{unknown}}');
    });

    it('replaces multiple distinct variables in one template', () => {
      expect(
        evaluateTemplate('{{a}} and {{b}}', {
          a: () => 'A',
          b: () => 'B',
        }),
      ).toBe('A and B');
    });

    it('replaces the same variable multiple times independently', () => {
      let count = 0;
      const out = evaluateTemplate('{{x}}-{{x}}', {
        x: () => {
          count += 1;
          return String(count);
        },
      });
      expect(out).toBe('1-2');
    });

    it('does not perform recursive evaluation on evaluator output', () => {
      // If an evaluator returns '{{x}}', that literal should remain;
      // we avoid re-scanning to prevent infinite loops and surprises.
      expect(
        evaluateTemplate('{{a}}', {
          a: () => '{{x}}',
          x: () => 'X',
        }),
      ).toBe('{{x}}');
    });

    it('handles parameters that contain hyphens and digits (e.g. range form)', () => {
      const captured: Array<string | null> = [];
      evaluateTemplate('{{daily_journal_path:0-7}}', {
        daily_journal_path: (param) => {
          captured.push(param);
          return 'paths';
        },
      });
      expect(captured).toEqual(['0-7']);
    });

    it('only matches variable names with letters, digits, and underscores', () => {
      // Names with spaces or other punctuation should not be treated as variables.
      expect(evaluateTemplate('{{ now }}', { now: () => 'X' })).toBe('{{ now }}');
    });
  });
});
