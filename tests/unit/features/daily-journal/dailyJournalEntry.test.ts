import {
  formatJournalEntry,
  isCrossDayContinuation,
  TITLE_PENDING_PLACEHOLDER,
} from '../../../../src/features/daily-journal/dailyJournalEntry';

describe('formatJournalEntry', () => {
  const baseTime = new Date(2026, 4, 13, 5, 35, 0); // 2026-05-13 05:35:00 local

  it('formats a regular entry with HH:MM, link, and title', () => {
    expect(
      formatJournalEntry({
        time: baseTime,
        convId: 'conv-1778573720786-r0xc1tpxl',
        jsonlPath: 'C:\\Users\\order\\.claude\\projects\\X\\session.jsonl',
        title: 'Plan something',
      }),
    ).toBe(
      '- 05:35 [conv-1778573720786-r0xc1tpxl](C:\\Users\\order\\.claude\\projects\\X\\session.jsonl) Plan something',
    );
  });

  it('zero-pads single-digit hours and minutes', () => {
    expect(
      formatJournalEntry({
        time: new Date(2026, 4, 13, 9, 7, 0),
        convId: 'conv-X',
        jsonlPath: '/p',
        title: 'Hello',
      }),
    ).toBe('- 09:07 [conv-X](/p) Hello');
  });

  it('inserts the cross-day label right after the time when continuedFrom is set', () => {
    expect(
      formatJournalEntry({
        time: baseTime,
        convId: 'conv-X',
        jsonlPath: '/p',
        title: 'Plan continued',
        continuedFrom: new Date(2026, 4, 12, 17, 15, 0), // 5/12 17:15
      }),
    ).toBe('- 05:35 (↳ 5/12 17:15) [conv-X](/p) Plan continued');
  });

  it('does not zero-pad month/day in the cross-day label (matches design)', () => {
    // The (↳ M/D HH:MM) label uses non-padded month/day per design — minimal width.
    expect(
      formatJournalEntry({
        time: baseTime,
        convId: 'conv-X',
        jsonlPath: '/p',
        title: 't',
        continuedFrom: new Date(2026, 0, 2, 3, 4, 0), // 1/2 03:04
      }),
    ).toBe('- 05:35 (↳ 1/2 03:04) [conv-X](/p) t');
  });

  it('uses the title-pending placeholder when no real title is provided', () => {
    expect(
      formatJournalEntry({
        time: baseTime,
        convId: 'conv-X',
        jsonlPath: '/p',
        title: TITLE_PENDING_PLACEHOLDER,
      }),
    ).toContain('（タイトル生成中）');
  });
});

describe('isCrossDayContinuation', () => {
  // 2026-05-13 05:35 local — "now" is the second-session resume time
  const now = new Date(2026, 4, 13, 5, 35, 0);

  it('returns true when createdAt is before today 00:00 (cross-day)', () => {
    const createdAt = new Date(2026, 4, 12, 17, 15, 0); // 5/12 17:15
    expect(isCrossDayContinuation(createdAt, now)).toBe(true);
  });

  it('returns false when createdAt is on the same day (no cross-day)', () => {
    const createdAt = new Date(2026, 4, 13, 4, 0, 0); // 5/13 04:00
    expect(isCrossDayContinuation(createdAt, now)).toBe(false);
  });

  it('returns false at exactly today 00:00 (boundary, inclusive)', () => {
    // A Conv created at today's 00:00 is "today" — not a cross-day continuation.
    const createdAt = new Date(2026, 4, 13, 0, 0, 0);
    expect(isCrossDayContinuation(createdAt, now)).toBe(false);
  });

  it('returns true at one millisecond before today 00:00', () => {
    const createdAt = new Date(2026, 4, 12, 23, 59, 59, 999);
    expect(isCrossDayContinuation(createdAt, now)).toBe(true);
  });

  it('returns true across month boundaries', () => {
    const start = new Date(2026, 0, 1, 5, 0, 0); // Jan 1 05:00
    const end = new Date(2025, 11, 31, 23, 0, 0); // Dec 31 23:00 (previous year)
    expect(isCrossDayContinuation(end, start)).toBe(true);
  });
});
