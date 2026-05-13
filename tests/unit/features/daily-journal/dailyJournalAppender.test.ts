import {
  appendJournalEntry,
  type JournalVault,
  updateJournalEntryTitle,
} from '../../../../src/features/daily-journal/dailyJournalAppender';

/**
 * Minimal in-memory implementation of the JournalVault interface used by tests.
 * The Templater-running scenario is simulated by mutating `files` inside the
 * injected `sleep` callback (see the relevant test below).
 */
function plainFakeVault(initial: Record<string, string> = {}): JournalVault & {
  files: Map<string, string>;
  log: string[];
} {
  const files = new Map(Object.entries(initial));
  const log: string[] = [];
  return {
    files,
    log,
    exists: (p: string) => files.has(p),
    read: async (p: string) => {
      log.push(`read:${p}`);
      return files.get(p) ?? '';
    },
    create: async (p: string, c: string) => {
      log.push(`create:${p}:${JSON.stringify(c)}`);
      files.set(p, c);
    },
    modify: async (p: string, c: string) => {
      log.push(`modify:${p}:${JSON.stringify(c)}`);
      files.set(p, c);
    },
  };
}

const noopSleep = async (_ms: number) => {};

describe('appendJournalEntry', () => {
  describe('existing file', () => {
    it('appends to file end when marker is empty', async () => {
      const vault = plainFakeVault({
        'journal/260513.md': '---\ntype: x\n---\n',
      });
      await appendJournalEntry({
        vault,
        filePath: 'journal/260513.md',
        sectionMarker: '',
        entry: '- 05:35 [conv-X](/p) hello',
        convId: 'conv-X',
        sleep: noopSleep,
      });
      expect(vault.files.get('journal/260513.md')).toBe(
        '---\ntype: x\n---\n- 05:35 [conv-X](/p) hello\n',
      );
    });

    it('appends inside the named section when marker is present', async () => {
      const vault = plainFakeVault({
        'j.md': '---\nx: 1\n---\n\n## Sessions\n- 04:00 [conv-A](/a) prev\n',
      });
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '## Sessions',
        entry: '- 05:35 [conv-B](/b) new',
        convId: 'conv-B',
        sleep: noopSleep,
      });
      expect(vault.files.get('j.md')).toBe(
        '---\nx: 1\n---\n\n## Sessions\n- 04:00 [conv-A](/a) prev\n- 05:35 [conv-B](/b) new\n',
      );
    });

    it('is a no-op when the conv id is already present (duplicate prevention)', async () => {
      const before = '## Sessions\n- 05:35 [conv-X](/p) prev\n';
      const vault = plainFakeVault({ 'j.md': before });
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '## Sessions',
        entry: '- 05:35 [conv-X](/p) latest',
        convId: 'conv-X',
        sleep: noopSleep,
      });
      expect(vault.files.get('j.md')).toBe(before);
      expect(vault.log).toContain('read:j.md');
      // No modify call should have happened.
      expect(vault.log.some((l) => l.startsWith('modify:'))).toBe(false);
    });
  });

  describe('file does not exist (F-9 fallback)', () => {
    it('creates empty file, waits, then writes only the marker line when Templater did not run', async () => {
      const vault = plainFakeVault();
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '## Sessions',
        entry: '- 05:35 [conv-X](/p) hello',
        convId: 'conv-X',
        sleep: noopSleep,
      });
      // create('') → templater no-op → modify(marker) → modify(marker + entry).
      expect(vault.log[0]).toBe('create:j.md:""');
      expect(vault.files.get('j.md')).toBe('## Sessions\n- 05:35 [conv-X](/p) hello\n');
    });

    it('creates empty file and stays empty + appended entry when marker is empty', async () => {
      const vault = plainFakeVault();
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '',
        entry: '- 05:35 [conv-X](/p) hello',
        convId: 'conv-X',
        sleep: noopSleep,
      });
      // F-9 with empty marker: Claudian writes neither frontmatter nor heading.
      expect(vault.files.get('j.md')).toBe('- 05:35 [conv-X](/p) hello\n');
    });

    it('skips the marker write when Templater filled the file during the wait', async () => {
      const vault: ReturnType<typeof plainFakeVault> = plainFakeVault();
      // Mimic Templater's effect: after create(), the first read returns
      // a non-empty content because Templater wrote it asynchronously.
      const sleepThatTriggersTemplater = async (_ms: number) => {
        vault.files.set(
          'j.md',
          '---\ntype: ai-journal\n---\n\n## Sessions\n',
        );
      };
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '## Sessions',
        entry: '- 05:35 [conv-X](/p) hello',
        convId: 'conv-X',
        sleep: sleepThatTriggersTemplater,
      });
      expect(vault.files.get('j.md')).toBe(
        '---\ntype: ai-journal\n---\n\n## Sessions\n- 05:35 [conv-X](/p) hello\n',
      );
      // Important: no extra `modify` writing the marker by Claudian.
      const modifyCalls = vault.log.filter((l) => l.startsWith('modify:'));
      expect(modifyCalls).toHaveLength(1);
    });

    it('uses the default 500ms wait if templaterWaitMs is not provided', async () => {
      // We don't actually wait — sleep is injected, so the test just
      // verifies which value is passed to it.
      const waits: number[] = [];
      const vault = plainFakeVault();
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '',
        entry: '- 05:35 [conv-X](/p) hi',
        convId: 'conv-X',
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      expect(waits).toEqual([500]);
    });

    it('respects a custom templaterWaitMs', async () => {
      const waits: number[] = [];
      const vault = plainFakeVault();
      await appendJournalEntry({
        vault,
        filePath: 'j.md',
        sectionMarker: '',
        entry: '- 05:35 [conv-X](/p) hi',
        convId: 'conv-X',
        sleep: async (ms) => {
          waits.push(ms);
        },
        templaterWaitMs: 50,
      });
      expect(waits).toEqual([50]);
    });
  });
});

describe('updateJournalEntryTitle', () => {
  it('replaces the placeholder title with the new title in place', async () => {
    const vault = plainFakeVault({
      'j.md': '## Sessions\n- 05:35 [conv-X](/p) （タイトル生成中）\n',
    });
    await updateJournalEntryTitle({
      vault,
      filePath: 'j.md',
      convId: 'conv-X',
      newTitle: 'Real Title',
    });
    expect(vault.files.get('j.md')).toBe(
      '## Sessions\n- 05:35 [conv-X](/p) Real Title\n',
    );
  });

  it('is a no-op when the file does not exist', async () => {
    const vault = plainFakeVault();
    await updateJournalEntryTitle({
      vault,
      filePath: 'j.md',
      convId: 'conv-X',
      newTitle: 'X',
    });
    expect(vault.files.has('j.md')).toBe(false);
  });

  it('is a no-op when the conv id is not present', async () => {
    const before = '- 05:35 [conv-OTHER](/p) hi\n';
    const vault = plainFakeVault({ 'j.md': before });
    await updateJournalEntryTitle({
      vault,
      filePath: 'j.md',
      convId: 'conv-X',
      newTitle: 'X',
    });
    expect(vault.files.get('j.md')).toBe(before);
    // No modify call should have happened.
    expect(vault.log.some((l) => l.startsWith('modify:'))).toBe(false);
  });

  it('is a no-op when the file is empty', async () => {
    const vault = plainFakeVault({ 'j.md': '' });
    await updateJournalEntryTitle({
      vault,
      filePath: 'j.md',
      convId: 'conv-X',
      newTitle: 'X',
    });
    expect(vault.files.get('j.md')).toBe('');
  });
});
