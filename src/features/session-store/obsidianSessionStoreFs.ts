import type { DataAdapter } from 'obsidian';

import type { SessionStoreFs } from './localFsSessionStore';

/**
 * Adapts Obsidian's `DataAdapter` to the `SessionStoreFs` interface used
 * by `LocalFsSessionStore`.
 *
 * Conventions reconciled with the underlying adapter:
 * - `DataAdapter.list` returns full paths; we convert them to basenames
 *   so the rest of the session-store code can compose paths via
 *   `${parent}/${child}` without double-prefixing.
 * - `DataAdapter` has no native `append`, so we implement it as
 *   read-modify-write serialized through a per-instance promise chain
 *   (mirroring `core/storage/VaultFileAdapter`). Within a single Claudian
 *   process this is sufficient to prevent interleaved writes from
 *   clobbering each other; cross-process safety is not promised by the
 *   SessionStore contract anyway.
 * - `ensureDir` walks the path one segment at a time so older Obsidian
 *   builds (whose `mkdir` is non-recursive) still work correctly.
 */
export class ObsidianSessionStoreFs implements SessionStoreFs {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly adapter: DataAdapter) {}

  async exists(path: string): Promise<boolean> {
    return this.adapter.exists(path);
  }

  async read(path: string): Promise<string> {
    return this.adapter.read(path);
  }

  async append(path: string, content: string): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(async () => {
        if (await this.adapter.exists(path)) {
          const existing = await this.adapter.read(path);
          await this.adapter.write(path, existing + content);
        } else {
          await this.adapter.write(path, content);
        }
      })
      .catch(() => {
        // Swallow so a single failure doesn't permanently stall the queue;
        // the caller already saw the rejection on its own await.
      });
    await this.writeQueue;
  }

  async list(path: string): Promise<{ files: string[]; dirs: string[] }> {
    const listing = await this.adapter.list(path);
    return {
      files: listing.files.map(basename),
      dirs: listing.folders.map(basename),
    };
  }

  async ensureDir(path: string): Promise<void> {
    if (await this.adapter.exists(path)) return;
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.adapter.exists(current))) {
        await this.adapter.mkdir(current);
      }
    }
  }
}

function basename(fullPath: string): string {
  const idx = fullPath.lastIndexOf('/');
  return idx === -1 ? fullPath : fullPath.slice(idx + 1);
}
