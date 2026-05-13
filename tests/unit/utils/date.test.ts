import { formatDate, formatDurationMmSs, getTodayDate } from '../../../src/utils/date';

describe('getTodayDate', () => {
  it('returns readable date with ISO suffix', () => {
    const result = getTodayDate();
    expect(result).toMatch(/\(\d{4}-\d{2}-\d{2}\)$/);
  });

  it('includes day of week and full date', () => {
    const result = getTodayDate();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const now = new Date();
    expect(result).toContain(days[now.getDay()]);
    expect(result).toContain(months[now.getMonth()]);
    expect(result).toContain(String(now.getFullYear()));
  });

  it('ISO portion matches current date', () => {
    const result = getTodayDate();
    const isoMatch = result.match(/\((\d{4}-\d{2}-\d{2})\)/);
    expect(isoMatch).not.toBeNull();
    const today = new Date().toISOString().split('T')[0];
    expect(isoMatch![1]).toBe(today);
  });
});

describe('formatDurationMmSs', () => {
  it('formats 0 seconds as 0s', () => {
    expect(formatDurationMmSs(0)).toBe('0s');
  });

  it('formats 59 seconds as 59s', () => {
    expect(formatDurationMmSs(59)).toBe('59s');
  });

  it('formats 60 seconds as 1m 0s', () => {
    expect(formatDurationMmSs(60)).toBe('1m 0s');
  });

  it('formats 61 seconds as 1m 1s', () => {
    expect(formatDurationMmSs(61)).toBe('1m 1s');
  });

  it('formats single digit seconds without leading zero', () => {
    expect(formatDurationMmSs(5)).toBe('5s');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatDurationMmSs(125)).toBe('2m 5s');
  });

  it('formats large durations correctly', () => {
    // 10 minutes 30 seconds = 630 seconds
    expect(formatDurationMmSs(630)).toBe('10m 30s');
  });

  it('formats hour+ durations correctly', () => {
    // 1 hour 5 minutes = 65 minutes = 3900 seconds
    expect(formatDurationMmSs(3900)).toBe('65m 0s');
  });

  describe('input validation', () => {
    it('returns 0s for negative values', () => {
      expect(formatDurationMmSs(-1)).toBe('0s');
      expect(formatDurationMmSs(-60)).toBe('0s');
      expect(formatDurationMmSs(-100)).toBe('0s');
    });

    it('returns 0s for NaN', () => {
      expect(formatDurationMmSs(NaN)).toBe('0s');
    });

    it('returns 0s for Infinity', () => {
      expect(formatDurationMmSs(Infinity)).toBe('0s');
      expect(formatDurationMmSs(-Infinity)).toBe('0s');
    });
  });
});

describe('formatDate', () => {
  // Use a fixed date so tests are deterministic. Local-time constructor is
  // intentional: we format using local time, not UTC.
  // 2026-05-13 (Wed) 08:07:09 local.
  const fixed = new Date(2026, 4, 13, 8, 7, 9);

  it('formats with the default pattern when none is provided', () => {
    expect(formatDate(fixed)).toBe('2026-05-13 08:07:09');
  });

  it('formats with an explicit YYYY-MM-DD HH:mm:ss pattern', () => {
    expect(formatDate(fixed, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-05-13 08:07:09');
  });

  it('supports YY (2-digit year)', () => {
    expect(formatDate(fixed, 'YY')).toBe('26');
  });

  it('supports compact YYMMDD form (for journal filenames)', () => {
    expect(formatDate(fixed, 'YYMMDD')).toBe('260513');
  });

  it('pads single-digit month/day/hour/minute/second with leading zero', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5); // 2026-01-02 03:04:05
    expect(formatDate(d, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-02 03:04:05');
  });

  it('distinguishes MM (month) from mm (minute)', () => {
    expect(formatDate(fixed, 'MM-mm')).toBe('05-07');
  });

  it('returns empty string for empty pattern', () => {
    expect(formatDate(fixed, '')).toBe('');
  });

  it('leaves unknown characters untouched', () => {
    expect(formatDate(fixed, 'Date: YYYY/MM/DD')).toBe('Date: 2026/05/13');
  });

  it('returns empty string when given an invalid Date', () => {
    // Defensive: callers may pass new Date(NaN) by mistake; we don't want
    // 'NaN-NaN-NaN' leaking into LLM prompts.
    expect(formatDate(new Date(NaN), 'YYYY-MM-DD')).toBe('');
  });
});
