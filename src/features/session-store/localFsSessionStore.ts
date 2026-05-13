import type {
  SessionKey,
  SessionStore,
  SessionStoreEntry,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Minimal filesystem-like interface the adapter uses for I/O.
 *
 * Kept narrow so unit tests can supply an in-memory fake without dragging
 * in Obsidian's full `Vault` / `DataAdapter` types. The integration layer
 * (Claudian plugin) adapts `app.vault.adapter` to this shape.
 *
 * All paths are forward-slash-separated; Obsidian's adapter normalizes
 * separators internally so this is safe on Windows.
 */
export interface SessionStoreFs {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  append(path: string, content: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; dirs: string[] }>;
  ensureDir(path: string): Promise<void>;
}

export interface LocalFsSessionStoreOptions {
  fs: SessionStoreFs;
  /**
   * Vault-relative root directory for transcript files, e.g.
   * `'transcription'`. The adapter writes main transcripts as
   * `{rootDir}/{sessionId}.jsonl` and subpath transcripts as
   * `{rootDir}/{sessionId}/{subpath}.jsonl`. The default lives at
   * `defaultSettings.sessionStoreRootDir`.
   */
  rootDir: string;
}

/**
 * SessionStore adapter that mirrors session transcripts to local files
 * inside the Obsidian Vault. The Vault is expected to be synchronized
 * across machines (git, Obsidian Sync, etc.), so the same transcripts
 * are available wherever the Vault is opened — which is the whole point
 * of running this adapter instead of relying on the SDK's per-host
 * `~/.claude/projects/` location.
 *
 * R-7 (planning log): `SessionKey.projectKey` is deliberately ignored.
 * The SDK default encodes it from the absolute cwd, which differs
 * between machines (e.g. `D:\Study\stellartoffice_com` vs
 * `C:\Repo\stellartoffice_com`). Mapping every key into the single
 * Vault-scoped root makes cross-machine resume work without imposing
 * a uniform vault path across machines.
 */
export class LocalFsSessionStore implements SessionStore {
  private readonly fs: SessionStoreFs;
  private readonly rootDir: string;

  constructor(options: LocalFsSessionStoreOptions) {
    this.fs = options.fs;
    this.rootDir = options.rootDir;
  }

  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const path = this.keyToPath(key);
    await this.fs.ensureDir(dirname(path));

    const existingUuids = await this.collectExistingUuids(path);
    const linesToAppend: string[] = [];
    for (const entry of entries) {
      if (typeof entry.uuid === 'string' && existingUuids.has(entry.uuid)) {
        continue;
      }
      linesToAppend.push(JSON.stringify(entry));
      if (typeof entry.uuid === 'string') {
        existingUuids.add(entry.uuid);
      }
    }
    if (linesToAppend.length === 0) return;

    await this.fs.append(path, linesToAppend.join('\n') + '\n');
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    const path = this.keyToPath(key);
    if (!(await this.fs.exists(path))) return null;
    const content = await this.fs.read(path);
    return parseJsonl(content);
  }

  async listSubkeys(key: {
    projectKey: string;
    sessionId: string;
  }): Promise<string[]> {
    const sessionDir = `${this.rootDir}/${key.sessionId}`;
    if (!(await this.fs.exists(sessionDir))) return [];
    return walkJsonl(this.fs, sessionDir, '');
  }

  private keyToPath(key: SessionKey): string {
    if (key.subpath === undefined) {
      return `${this.rootDir}/${key.sessionId}.jsonl`;
    }
    return `${this.rootDir}/${key.sessionId}/${key.subpath}.jsonl`;
  }

  private async collectExistingUuids(path: string): Promise<Set<string>> {
    const uuids = new Set<string>();
    if (!(await this.fs.exists(path))) return uuids;
    const content = await this.fs.read(path);
    for (const entry of parseJsonl(content)) {
      if (typeof entry.uuid === 'string') uuids.add(entry.uuid);
    }
    return uuids;
  }
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '' : path.slice(0, idx);
}

function parseJsonl(content: string): SessionStoreEntry[] {
  if (!content) return [];
  const entries: SessionStoreEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as SessionStoreEntry);
    } catch {
      // Skip malformed lines silently. The SDK never byte-compares
      // entries; if a line is corrupt we simply lose that entry, which
      // is preferable to throwing and breaking the entire load.
    }
  }
  return entries;
}

async function walkJsonl(
  fs: SessionStoreFs,
  dir: string,
  prefix: string,
): Promise<string[]> {
  const { files, dirs } = await fs.list(dir);
  const out: string[] = [];
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    const stem = file.slice(0, -'.jsonl'.length);
    out.push(prefix ? `${prefix}/${stem}` : stem);
  }
  for (const childDir of dirs) {
    const childPrefix = prefix ? `${prefix}/${childDir}` : childDir;
    const childResults = await walkJsonl(fs, `${dir}/${childDir}`, childPrefix);
    out.push(...childResults);
  }
  return out;
}
