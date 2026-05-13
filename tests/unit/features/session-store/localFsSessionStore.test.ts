import {
  LocalFsSessionStore,
  type SessionStoreFs,
} from '../../../../src/features/session-store/localFsSessionStore';

/**
 * In-memory implementation of the SessionStoreFs interface used by tests.
 *
 * Stores file contents in a `Map<string, string>` keyed by absolute-ish
 * path. Directories are inferred from path prefixes; an empty entry is
 * created for each `ensureDir` call so `list` can return them.
 *
 * Path semantics follow the production layout (forward slash separated,
 * no Windows-specific normalization). The adapter only ever builds paths
 * via string concatenation so this is a faithful test substrate.
 */
function fakeFs(initial: Record<string, string> = {}): SessionStoreFs & {
  files: Map<string, string>;
  dirs: Set<string>;
  log: string[];
} {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();
  const log: string[] = [];

  // Seed directories from initial file paths so `list` works without
  // an explicit ensureDir for prepopulated test data.
  for (const path of files.keys()) {
    let parent = path;
    while (true) {
      const idx = parent.lastIndexOf('/');
      if (idx <= 0) break;
      parent = parent.slice(0, idx);
      dirs.add(parent);
    }
  }

  return {
    files,
    dirs,
    log,
    exists: (p) => files.has(p) || dirs.has(p),
    read: async (p) => {
      log.push(`read:${p}`);
      return files.get(p) ?? '';
    },
    append: async (p, c) => {
      log.push(`append:${p}:${JSON.stringify(c)}`);
      const prev = files.get(p) ?? '';
      files.set(p, prev + c);
    },
    ensureDir: async (p) => {
      log.push(`ensureDir:${p}`);
      // Mirror Obsidian's `app.vault.adapter.mkdir` semantics, which
      // creates parent directories recursively (mkdir -p). The adapter
      // relies on this and never calls ensureDir on every parent.
      let current = p;
      while (current) {
        if (dirs.has(current)) break;
        dirs.add(current);
        const idx = current.lastIndexOf('/');
        if (idx <= 0) break;
        current = current.slice(0, idx);
      }
    },
    list: async (p) => {
      const childFiles: string[] = [];
      const childDirs: string[] = [];
      const prefix = `${p}/`;
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (rest.includes('/')) continue;
        childFiles.push(rest);
      }
      for (const dir of dirs) {
        if (!dir.startsWith(prefix)) continue;
        const rest = dir.slice(prefix.length);
        if (rest.includes('/')) continue;
        childDirs.push(rest);
      }
      return { files: childFiles, dirs: childDirs };
    },
  };
}

const ROOT = '.claudian/transcripts';
const PROJECT_KEY = 'vault'; // fixed-value mapping (R-7)

function makeStore(initial: Record<string, string> = {}): {
  store: LocalFsSessionStore;
  fs: ReturnType<typeof fakeFs>;
} {
  const fs = fakeFs(initial);
  const store = new LocalFsSessionStore({ fs, rootDir: ROOT });
  return { store, fs };
}

describe('LocalFsSessionStore', () => {
  describe('append + load (main transcript)', () => {
    it('round-trips entries written for the same sessionId', async () => {
      const { store } = makeStore();
      const key = { projectKey: PROJECT_KEY, sessionId: 'sess-1' };
      const entries = [
        { type: 'user', uuid: 'u1', message: 'hi' },
        { type: 'assistant', uuid: 'a1', message: 'hello' },
      ];

      await store.append(key, entries);
      const loaded = await store.load(key);

      expect(loaded).toEqual(entries);
    });

    it('persists multiple append batches in order', async () => {
      const { store } = makeStore();
      const key = { projectKey: PROJECT_KEY, sessionId: 'sess-2' };

      await store.append(key, [{ type: 'user', uuid: 'u1' }]);
      await store.append(key, [{ type: 'assistant', uuid: 'a1' }]);
      await store.append(key, [{ type: 'user', uuid: 'u2' }]);

      const loaded = await store.load(key);
      expect(loaded).toEqual([
        { type: 'user', uuid: 'u1' },
        { type: 'assistant', uuid: 'a1' },
        { type: 'user', uuid: 'u2' },
      ]);
    });

    it('returns null when the session was never written', async () => {
      const { store } = makeStore();
      const loaded = await store.load({
        projectKey: PROJECT_KEY,
        sessionId: 'never-existed',
      });
      expect(loaded).toBeNull();
    });

    it('returns an empty array when the file exists but is empty', async () => {
      const { store } = makeStore({
        [`${ROOT}/sess-empty.jsonl`]: '',
      });
      const loaded = await store.load({
        projectKey: PROJECT_KEY,
        sessionId: 'sess-empty',
      });
      expect(loaded).toEqual([]);
    });

    it('writes to the path { rootDir }/{ sessionId }.jsonl', async () => {
      const { store, fs } = makeStore();
      await store.append(
        { projectKey: PROJECT_KEY, sessionId: 'sess-path' },
        [{ type: 'user', uuid: 'u1' }],
      );
      expect(fs.files.has(`${ROOT}/sess-path.jsonl`)).toBe(true);
    });

    it('ignores SessionKey.projectKey (R-7 fixed-value mapping)', async () => {
      // The same sessionId+subpath written with different projectKey values
      // must land in the same file, because the adapter is configured for a
      // single Vault scope.
      const { store, fs } = makeStore();
      const sessionId = 'sess-shared';

      await store.append(
        { projectKey: 'machine-a', sessionId },
        [{ type: 'user', uuid: 'u1' }],
      );
      await store.append(
        { projectKey: 'machine-b', sessionId },
        [{ type: 'assistant', uuid: 'a1' }],
      );

      // Only one file written, both entries inside.
      const matching = [...fs.files.keys()].filter((p) => p.includes(sessionId));
      expect(matching).toEqual([`${ROOT}/${sessionId}.jsonl`]);
      const loaded = await store.load({ projectKey: 'doesnt-matter', sessionId });
      expect(loaded).toEqual([
        { type: 'user', uuid: 'u1' },
        { type: 'assistant', uuid: 'a1' },
      ]);
    });
  });

  describe('append idempotency on uuid', () => {
    it('skips entries whose uuid is already persisted', async () => {
      const { store } = makeStore();
      const key = { projectKey: PROJECT_KEY, sessionId: 'sess-id' };

      await store.append(key, [
        { type: 'user', uuid: 'u1', text: 'first' },
        { type: 'assistant', uuid: 'a1', text: 'reply' },
      ]);
      // Re-send the same batch (simulating an SDK retry).
      await store.append(key, [
        { type: 'user', uuid: 'u1', text: 'first' },
        { type: 'assistant', uuid: 'a1', text: 'reply' },
      ]);

      const loaded = await store.load(key);
      expect(loaded).toEqual([
        { type: 'user', uuid: 'u1', text: 'first' },
        { type: 'assistant', uuid: 'a1', text: 'reply' },
      ]);
    });

    it('appends entries without a uuid every time (no dedup)', async () => {
      const { store } = makeStore();
      const key = { projectKey: PROJECT_KEY, sessionId: 'sess-nouuid' };

      // Titles / tags / mode markers come through without a uuid per the
      // SessionStore contract; these MUST be appended on each call.
      await store.append(key, [{ type: 'title', title: 'first attempt' }]);
      await store.append(key, [{ type: 'title', title: 'first attempt' }]);

      const loaded = await store.load(key);
      expect(loaded).toEqual([
        { type: 'title', title: 'first attempt' },
        { type: 'title', title: 'first attempt' },
      ]);
    });

    it('mixes uuid-deduped entries and non-uuid entries in one batch', async () => {
      const { store } = makeStore();
      const key = { projectKey: PROJECT_KEY, sessionId: 'sess-mix' };

      await store.append(key, [
        { type: 'user', uuid: 'u1' },
        { type: 'title', title: 'A' },
      ]);
      await store.append(key, [
        { type: 'user', uuid: 'u1' }, // skipped (duplicate uuid)
        { type: 'title', title: 'B' }, // kept (no uuid)
      ]);

      const loaded = await store.load(key);
      expect(loaded).toEqual([
        { type: 'user', uuid: 'u1' },
        { type: 'title', title: 'A' },
        { type: 'title', title: 'B' },
      ]);
    });

    it('is a no-op when the batch is empty', async () => {
      const { store, fs } = makeStore();
      await store.append(
        { projectKey: PROJECT_KEY, sessionId: 'sess-empty-batch' },
        [],
      );
      // Nothing should have been written, not even an empty file.
      expect(fs.files.size).toBe(0);
    });
  });

  describe('subpath routing (subagents)', () => {
    it('writes subpath entries under { rootDir }/{ sessionId }/{ subpath }.jsonl', async () => {
      const { store, fs } = makeStore();
      const sessionId = 'sess-sub';
      const subpath = 'subagents/agent-001';

      await store.append(
        { projectKey: PROJECT_KEY, sessionId, subpath },
        [{ type: 'assistant', uuid: 'sa1' }],
      );

      expect(fs.files.has(`${ROOT}/${sessionId}/${subpath}.jsonl`)).toBe(true);
      expect(fs.files.has(`${ROOT}/${sessionId}.jsonl`)).toBe(false);
    });

    it('keeps main and subpath transcripts in separate files', async () => {
      const { store } = makeStore();
      const sessionId = 'sess-mainsub';

      await store.append(
        { projectKey: PROJECT_KEY, sessionId },
        [{ type: 'user', uuid: 'u1', text: 'main' }],
      );
      await store.append(
        { projectKey: PROJECT_KEY, sessionId, subpath: 'subagents/agent-001' },
        [{ type: 'assistant', uuid: 'sa1', text: 'sub' }],
      );

      const main = await store.load({ projectKey: PROJECT_KEY, sessionId });
      const sub = await store.load({
        projectKey: PROJECT_KEY,
        sessionId,
        subpath: 'subagents/agent-001',
      });

      expect(main).toEqual([{ type: 'user', uuid: 'u1', text: 'main' }]);
      expect(sub).toEqual([{ type: 'assistant', uuid: 'sa1', text: 'sub' }]);
    });
  });

  describe('listSubkeys', () => {
    it('returns an empty array when no subagent transcripts exist', async () => {
      const { store } = makeStore({
        [`${ROOT}/sess-nosubs.jsonl`]: '{"type":"user","uuid":"u1"}\n',
      });
      const keys = await store.listSubkeys({
        projectKey: PROJECT_KEY,
        sessionId: 'sess-nosubs',
      });
      expect(keys).toEqual([]);
    });

    it('returns an empty array when the session directory does not exist', async () => {
      const { store } = makeStore();
      const keys = await store.listSubkeys({
        projectKey: PROJECT_KEY,
        sessionId: 'sess-never',
      });
      expect(keys).toEqual([]);
    });

    it('lists subpaths for every .jsonl under the session directory', async () => {
      const { store } = makeStore();
      const sessionId = 'sess-many-subs';

      await store.append(
        { projectKey: PROJECT_KEY, sessionId, subpath: 'subagents/agent-001' },
        [{ type: 'assistant', uuid: 'sa1' }],
      );
      await store.append(
        { projectKey: PROJECT_KEY, sessionId, subpath: 'subagents/agent-002' },
        [{ type: 'assistant', uuid: 'sa2' }],
      );

      const keys = await store.listSubkeys({
        projectKey: PROJECT_KEY,
        sessionId,
      });
      expect(keys.sort()).toEqual(['subagents/agent-001', 'subagents/agent-002']);
    });
  });
});
