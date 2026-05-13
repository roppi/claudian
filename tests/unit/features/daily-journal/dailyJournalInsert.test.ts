import {
  containsConvId,
  insertEntry,
  replaceEntryLine,
  replaceTitleInEntry,
} from '../../../../src/features/daily-journal/dailyJournalInsert';

describe('containsConvId', () => {
  it('returns true when the conv id appears verbatim', () => {
    expect(
      containsConvId('- 05:35 [conv-ABC123](/p) hello', 'conv-ABC123'),
    ).toBe(true);
  });

  it('returns false when only a prefix-overlapping id is present', () => {
    // We want word-boundary safety: 'conv-ABC' should NOT match 'conv-ABC123'.
    expect(containsConvId('- 05:35 [conv-ABC123](/p) hello', 'conv-ABC')).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(containsConvId('', 'conv-X')).toBe(false);
  });
});

describe('insertEntry — no marker (marker = "")', () => {
  it('appends to the end of a non-empty file with a single trailing newline', () => {
    expect(insertEntry('existing line\n', '', '- 05:35 [conv-X](/p) t')).toBe(
      'existing line\n- 05:35 [conv-X](/p) t\n',
    );
  });

  it('handles content without trailing newline', () => {
    expect(insertEntry('existing line', '', '- 05:35 [conv-X](/p) t')).toBe(
      'existing line\n- 05:35 [conv-X](/p) t\n',
    );
  });

  it('writes a single entry when the file is empty', () => {
    expect(insertEntry('', '', '- 05:35 [conv-X](/p) t')).toBe(
      '- 05:35 [conv-X](/p) t\n',
    );
  });
});

describe('insertEntry — with section marker', () => {
  it('appends below the marker when no following heading exists', () => {
    const content = '---\ntype: x\n---\n\n## Sessions\n';
    expect(insertEntry(content, '## Sessions', '- 05:35 [conv-X](/p) t')).toBe(
      '---\ntype: x\n---\n\n## Sessions\n- 05:35 [conv-X](/p) t\n',
    );
  });

  it('appends to the end of the marker section when later headings exist', () => {
    const content = [
      '## Sessions',
      '- 04:00 [conv-A](/a) earlier',
      '',
      '## Notes',
      'something',
      '',
    ].join('\n');
    const out = insertEntry(content, '## Sessions', '- 05:35 [conv-B](/b) later');
    expect(out).toBe(
      [
        '## Sessions',
        '- 04:00 [conv-A](/a) earlier',
        '- 05:35 [conv-B](/b) later',
        '',
        '## Notes',
        'something',
        '',
      ].join('\n'),
    );
  });

  it('falls back to file-end append when the marker is not present', () => {
    const content = '## Other\nbody\n';
    expect(insertEntry(content, '## Sessions', '- 05:35 [conv-X](/p) t')).toBe(
      '## Other\nbody\n- 05:35 [conv-X](/p) t\n',
    );
  });

  it('handles marker as the very last line (no trailing newline)', () => {
    const content = '## Sessions';
    expect(insertEntry(content, '## Sessions', '- 05:35 [conv-X](/p) t')).toBe(
      '## Sessions\n- 05:35 [conv-X](/p) t\n',
    );
  });

  it('preserves a non-Markdown marker (arbitrary user-defined string)', () => {
    // Even non-heading markers work — we just look for the next '\n#' boundary.
    const content = '<!-- sessions -->\nprior\n## Other\nx\n';
    const out = insertEntry(content, '<!-- sessions -->', '- 05:35 [conv-X](/p) t');
    expect(out).toBe(
      '<!-- sessions -->\nprior\n- 05:35 [conv-X](/p) t\n\n## Other\nx\n',
    );
  });
});

describe('replaceEntryLine', () => {
  it('replaces the line containing the conv id with the new entry', () => {
    const content = [
      '## Sessions',
      '- 04:00 [conv-A](/a) earlier',
      '- 05:35 [conv-B](/b) Start Session',
      '- 06:00 [conv-C](/c) other',
      '',
    ].join('\n');
    const newEntry = '- 05:35 [conv-B](/b) Real Title';
    expect(replaceEntryLine(content, 'conv-B', newEntry)).toBe(
      [
        '## Sessions',
        '- 04:00 [conv-A](/a) earlier',
        '- 05:35 [conv-B](/b) Real Title',
        '- 06:00 [conv-C](/c) other',
        '',
      ].join('\n'),
    );
  });

  it('preserves the cross-day label when replacing (line is regenerated wholesale)', () => {
    // The new entry from the caller already contains the correct label —
    // replaceEntryLine just swaps the whole line, so labels are preserved
    // as long as the caller built newEntry with them.
    const content = '- 05:35 (↳ 5/12 17:15) [conv-B](/b) Start Session\n';
    const newEntry = '- 05:35 (↳ 5/12 17:15) [conv-B](/b) Real Title';
    expect(replaceEntryLine(content, 'conv-B', newEntry)).toBe(
      '- 05:35 (↳ 5/12 17:15) [conv-B](/b) Real Title\n',
    );
  });

  it('returns the content unchanged when the conv id is not found', () => {
    const content = '- 04:00 [conv-A](/a) earlier\n';
    expect(replaceEntryLine(content, 'conv-MISSING', '- whatever')).toBe(content);
  });

  it('replaces only the first matching line if duplicates exist', () => {
    // Defensive: dupes shouldn't happen in practice (containsConvId guards
    // appends), but if they do we only touch the first.
    const content = [
      '- 05:35 [conv-X](/p) first',
      '- 06:00 [conv-X](/p) second',
      '',
    ].join('\n');
    expect(replaceEntryLine(content, 'conv-X', '- replaced')).toBe(
      [
        '- replaced',
        '- 06:00 [conv-X](/p) second',
        '',
      ].join('\n'),
    );
  });

  it('does not match a strict prefix of a longer id', () => {
    const content = '- 05:35 [conv-ABC123](/p) keep me\n';
    expect(replaceEntryLine(content, 'conv-ABC', '- nope')).toBe(content);
  });
});

describe('replaceTitleInEntry', () => {
  it('swaps the title while keeping HH:MM and the conv-id link', () => {
    const content = '- 05:35 [conv-X](/p) Start Session\n';
    expect(replaceTitleInEntry(content, 'conv-X', 'Real Title')).toBe(
      '- 05:35 [conv-X](/p) Real Title\n',
    );
  });

  it('preserves the cross-day label position when present', () => {
    const content = '- 05:35 (↳ 5/12 17:15) [conv-X](/p) Start Session\n';
    expect(replaceTitleInEntry(content, 'conv-X', 'Continued Plan')).toBe(
      '- 05:35 (↳ 5/12 17:15) [conv-X](/p) Continued Plan\n',
    );
  });

  it('returns the content unchanged when the conv id is not present', () => {
    const content = '- 05:35 [conv-OTHER](/p) hello\n';
    expect(replaceTitleInEntry(content, 'conv-MISSING', 'X')).toBe(content);
  });

  it('does not match a strict prefix of a longer id', () => {
    const content = '- 05:35 [conv-ABC123](/p) keep me\n';
    expect(replaceTitleInEntry(content, 'conv-ABC', 'should not match')).toBe(content);
  });

  it('only replaces the first matching line if duplicates somehow exist', () => {
    const content = [
      '- 05:35 [conv-X](/p) first',
      '- 06:00 [conv-X](/p) second',
      '',
    ].join('\n');
    expect(replaceTitleInEntry(content, 'conv-X', 'NEW')).toBe(
      [
        '- 05:35 [conv-X](/p) NEW',
        '- 06:00 [conv-X](/p) second',
        '',
      ].join('\n'),
    );
  });

  it('handles a path with closing-paren-like characters by stopping at the link close', () => {
    // The jsonl absolute path on Windows may contain backslashes; we want
    // the regex to stop at the first ')' that closes the link.
    const content = '- 05:35 [conv-X](C:\\Users\\order\\session.jsonl) old title\n';
    expect(replaceTitleInEntry(content, 'conv-X', 'new title')).toBe(
      '- 05:35 [conv-X](C:\\Users\\order\\session.jsonl) new title\n',
    );
  });
});
