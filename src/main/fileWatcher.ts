import fs, { type FSWatcher } from 'node:fs';
import path from 'node:path';

const DEBOUNCE_MS = 150;
const DEFAULT_SUPPRESS_MS = 800;

function toSuppressionKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export class DocumentFileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly selfWriteUntil = new Map<string, number>();

  watch(filePath: string, onExternalChange: (filePath: string) => void): void {
    this.stop();

    const resolvedPath = path.resolve(filePath);
    const key = toSuppressionKey(resolvedPath);

    this.watcher = fs.watch(resolvedPath, { persistent: false }, () => {
      const suppressedUntil = this.selfWriteUntil.get(key) ?? 0;
      if (Date.now() < suppressedUntil) {
        return;
      }

      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        const currentSuppressedUntil = this.selfWriteUntil.get(key) ?? 0;
        if (Date.now() < currentSuppressedUntil) {
          return;
        }
        onExternalChange(resolvedPath);
      }, DEBOUNCE_MS);
    });

    this.watcher.on('error', () => {
      // Prevent unhandled error events if the watched file is deleted or moved externally.
    });
  }

  markSelfWrite(filePath: string, suppressMs = DEFAULT_SUPPRESS_MS): void {
    const key = toSuppressionKey(filePath);
    this.selfWriteUntil.set(key, Date.now() + suppressMs);
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  stop(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher !== null) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
