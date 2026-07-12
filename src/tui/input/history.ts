/**
 * Persisted prompt history. Entries live one-per-line in
 * `~/.local/share/coven/history` (default). Navigation is shell-style: `prev()`
 * walks back newest-first, `next()` walks forward toward the live line, and
 * `reset()` returns to it. Consecutive duplicates are collapsed; the file is
 * capped at 1000 lines. Read errors are swallowed (fresh history).
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MAX_ENTRIES = 1000;

function defaultFile(): string {
  return join(homedir(), ".local", "share", "coven", "history");
}

export class InputHistory {
  private entries: string[] = [];
  /** Cursor into `entries`; `entries.length` == the live (unsaved) line. */
  private pos: number;

  constructor(private file: string = defaultFile()) {
    try {
      this.entries = readFileSync(this.file, "utf8").split("\n").filter(Boolean);
    } catch {
      this.entries = [];
    }
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    this.pos = this.entries.length;
  }

  push(entry: string): void {
    if (!entry.trim()) return;
    if (this.entries[this.entries.length - 1] === entry) {
      this.pos = this.entries.length;
      return;
    }
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    this.pos = this.entries.length;
    this.persist(entry);
  }

  prev(): string | undefined {
    if (this.pos <= 0) return undefined;
    this.pos -= 1;
    return this.entries[this.pos];
  }

  next(): string | undefined {
    if (this.pos >= this.entries.length) return undefined;
    this.pos += 1;
    return this.pos >= this.entries.length ? undefined : this.entries[this.pos];
  }

  reset(): void {
    this.pos = this.entries.length;
  }

  all(): string[] {
    return [...this.entries];
  }

  private persist(entry: string): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Rewrite when a cap trim just happened, otherwise cheap append.
      if (this.entries.length >= MAX_ENTRIES) {
        writeFileSync(this.file, this.entries.join("\n") + "\n");
      } else {
        appendFileSync(this.file, entry + "\n");
      }
    } catch {
      // Persistence is best-effort; navigation still works in-memory.
    }
  }
}
