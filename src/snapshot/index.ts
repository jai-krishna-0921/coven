/**
 * Snapshot store — the substrate for session revert / undo.
 *
 * Design (pragmatic, no-git): every session gets a per-snapshot directory
 * under $XDG_DATA_HOME/coven/snapshots/<projectSlug>/<sessionID>/<snapshotID>/.
 * Before a tool writes to a file, `captureFile(sessionID, path)` records the
 * pre-mutation content (or a "did-not-exist" marker) in a mutable "pending"
 * area for the session. When the turn ends, `snapshot(sessionID, snapshotID)`
 * atomically moves the pending captures into the named snapshot dir.
 *
 * revert(sessionID, snapshotID) replays those captures — restoring old
 * content or deleting freshly-created files — after first taking a redo
 * snapshot of the CURRENT worktree state so `redo(sessionID)` can put things
 * back.
 *
 * This is not shadow-git (no shared object store, no tree hashes). But it
 * gives you the killer feature — "undo this entire agent turn's file
 * changes" — with no external dependency and no repo requirement.
 *
 * Files >2 MB are recorded by-path only (not content-backed) to keep the
 * snapshot dir bounded; a revert of a large file is a best-effort no-op with
 * a warning rather than silently succeeding.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve as pathResolve } from "node:path";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function projectSlug(root: string): string {
  const base = basename(root) || "root";
  const hash = createHash("sha256").update(pathResolve(root)).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

/**
 * A safe filename encoding of an absolute path — sha1 keeps it collision-free
 * without dragging weird chars through the filesystem. We also stash the
 * original path in a sidecar `.meta` file so `revert` can restore it.
 */
function fileKey(path: string): string {
  return createHash("sha1").update(pathResolve(path)).digest("hex");
}

interface CaptureMeta {
  path: string;
  existed: boolean;
  bytes?: number;
  /** sha256 of the captured content — reliable "did it change?" signal for diff(). */
  hash?: string;
}

export interface SnapshotDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
}

export interface SnapshotDescriptor {
  id: string;
  files: string[];
  createdAt: number;
}

export class SnapshotStore {
  private baseDir: string;

  constructor(private root: string, dataDir?: string) {
    const home = dataDir ?? join(homedir(), ".local", "share", "coven");
    this.baseDir = join(home, "snapshots", projectSlug(root));
  }

  private sessionDir(sessionID: string): string {
    return join(this.baseDir, sessionID);
  }

  private pendingDir(sessionID: string): string {
    return join(this.sessionDir(sessionID), "_pending");
  }

  private snapshotDir(sessionID: string, snapshotID: string): string {
    return join(this.sessionDir(sessionID), snapshotID);
  }

  private redoDir(sessionID: string): string {
    return join(this.sessionDir(sessionID), "_redo");
  }

  /**
   * Record the current on-disk state of `path` under the session's pending
   * capture area. Safe to call multiple times for the same path — only the
   * FIRST call within a snapshot window is recorded (later calls would
   * overwrite the pre-turn value with an intermediate one).
   */
  captureFile(sessionID: string, path: string): void {
    const abs = pathResolve(path);
    const dir = this.pendingDir(sessionID);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      return; // Read-only home — captures disabled, revert becomes a no-op.
    }
    const key = fileKey(abs);
    const contentPath = join(dir, key);
    const metaPath = join(dir, `${key}.meta`);
    if (existsSync(metaPath)) return; // already captured this window

    let meta: CaptureMeta;
    if (existsSync(abs)) {
      const size = statSync(abs).size;
      let hash: string | undefined;
      if (size <= MAX_FILE_BYTES) {
        try {
          const buf = readFileSync(abs);
          hash = createHash("sha256").update(buf).digest("hex");
          writeFileSync(contentPath, buf);
        } catch {
          // Fall through — record as size-only so revert reports it.
        }
      }
      meta = { path: abs, existed: true, bytes: size, hash };
    } else {
      meta = { path: abs, existed: false };
    }
    try {
      writeFileSync(metaPath, JSON.stringify(meta));
    } catch {
      /* best effort */
    }
  }

  /**
   * Freeze the pending captures under `snapshotID`. Overwrites any prior
   * snapshot with the same id. Returns the descriptor. If no captures were
   * pending, returns an empty descriptor without touching the filesystem.
   */
  snapshot(sessionID: string, snapshotID: string): SnapshotDescriptor {
    const pending = this.pendingDir(sessionID);
    if (!existsSync(pending)) return { id: snapshotID, files: [], createdAt: Date.now() };
    const target = this.snapshotDir(sessionID, snapshotID);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    try {
      renameSync(pending, target);
    } catch {
      // Rename across mounts fails — fall back to copy+delete.
      cpSync(pending, target, { recursive: true });
      rmSync(pending, { recursive: true, force: true });
    }
    return this.describe(sessionID, snapshotID);
  }

  describe(sessionID: string, snapshotID: string): SnapshotDescriptor {
    const dir = this.snapshotDir(sessionID, snapshotID);
    if (!existsSync(dir)) return { id: snapshotID, files: [], createdAt: 0 };
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".meta")) continue;
      const meta = this.readMeta(join(dir, entry));
      if (meta) files.push(meta.path);
    }
    let createdAt = 0;
    try {
      createdAt = statSync(dir).mtimeMs;
    } catch {
      /* ignore */
    }
    return { id: snapshotID, files, createdAt };
  }

  private readMeta(metaPath: string): CaptureMeta | undefined {
    try {
      return JSON.parse(readFileSync(metaPath, "utf8")) as CaptureMeta;
    } catch {
      return undefined;
    }
  }

  /**
   * Restore the worktree to the captured state of `snapshotID`. First takes
   * a "redo" snapshot of the CURRENT state so `redo(sessionID)` can walk it
   * back. Files >2MB (recorded by size-only) are left untouched with a warning.
   */
  revert(sessionID: string, snapshotID: string): { restored: string[]; skipped: string[] } {
    const restored: string[] = [];
    const skipped: string[] = [];
    const dir = this.snapshotDir(sessionID, snapshotID);
    if (!existsSync(dir)) return { restored, skipped };

    // Take a redo snapshot of current state for every file this revert will touch.
    this.captureCurrentAsRedo(sessionID, dir);

    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".meta")) continue;
      const meta = this.readMeta(join(dir, entry));
      if (!meta) continue;
      const key = entry.slice(0, -".meta".length);
      const contentPath = join(dir, key);
      if (!meta.existed) {
        try {
          if (existsSync(meta.path)) unlinkSync(meta.path);
          restored.push(meta.path);
        } catch {
          skipped.push(meta.path);
        }
        continue;
      }
      if (!existsSync(contentPath)) {
        // Size-only capture (huge file). We know it existed; can't restore content.
        skipped.push(meta.path);
        continue;
      }
      try {
        mkdirSync(dirname(meta.path), { recursive: true });
        cpSync(contentPath, meta.path);
        restored.push(meta.path);
      } catch {
        skipped.push(meta.path);
      }
    }
    return { restored, skipped };
  }

  private captureCurrentAsRedo(sessionID: string, snapshotDir: string): void {
    const redoDir = this.redoDir(sessionID);
    if (existsSync(redoDir)) rmSync(redoDir, { recursive: true, force: true });
    try {
      mkdirSync(redoDir, { recursive: true });
    } catch {
      return;
    }
    for (const entry of readdirSync(snapshotDir)) {
      if (!entry.endsWith(".meta")) continue;
      const meta = this.readMeta(join(snapshotDir, entry));
      if (!meta) continue;
      const key = entry.slice(0, -".meta".length);
      const currentExists = existsSync(meta.path);
      let bytes: number | undefined;
      if (currentExists) {
        try {
          bytes = statSync(meta.path).size;
          if (bytes <= MAX_FILE_BYTES) cpSync(meta.path, join(redoDir, key));
        } catch {
          /* ignore */
        }
      }
      try {
        writeFileSync(
          join(redoDir, `${key}.meta`),
          JSON.stringify({ path: meta.path, existed: currentExists, bytes } satisfies CaptureMeta),
        );
      } catch {
        /* ignore */
      }
    }
  }

  /** Re-apply the state that was on disk at the moment of the last revert. */
  redo(sessionID: string): boolean {
    const redoDir = this.redoDir(sessionID);
    if (!existsSync(redoDir)) return false;
    for (const entry of readdirSync(redoDir)) {
      if (!entry.endsWith(".meta")) continue;
      const meta = this.readMeta(join(redoDir, entry));
      if (!meta) continue;
      const key = entry.slice(0, -".meta".length);
      const contentPath = join(redoDir, key);
      if (!meta.existed) {
        try {
          if (existsSync(meta.path)) unlinkSync(meta.path);
        } catch {
          /* ignore */
        }
        continue;
      }
      if (!existsSync(contentPath)) continue; // huge file — leave alone
      try {
        mkdirSync(dirname(meta.path), { recursive: true });
        cpSync(contentPath, meta.path);
      } catch {
        /* ignore */
      }
    }
    rmSync(redoDir, { recursive: true, force: true });
    return true;
  }

  /** Set-like diff between two snapshots — useful for per-turn change summaries. */
  diff(sessionID: string, aID: string, bID: string): SnapshotDiff {
    const a = this.snapshotSizeMap(sessionID, aID);
    const b = this.snapshotSizeMap(sessionID, bID);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];
    for (const [path, bEntry] of b) {
      const aEntry = a.get(path);
      if (!aEntry) {
        added.push(path);
        continue;
      }
      if (aEntry.existed !== bEntry.existed) {
        (bEntry.existed ? added : removed).push(path);
      } else if (aEntry.existed && bEntry.existed && (aEntry.hash ?? aEntry.bytes) !== (bEntry.hash ?? bEntry.bytes)) {
        changed.push(path);
      } else {
        unchanged.push(path);
      }
    }
    for (const [path, aEntry] of a) {
      if (!b.has(path) && aEntry.existed) removed.push(path);
    }
    return { added, removed, changed, unchanged };
  }

  private snapshotSizeMap(sessionID: string, snapshotID: string): Map<string, CaptureMeta> {
    const map = new Map<string, CaptureMeta>();
    const dir = this.snapshotDir(sessionID, snapshotID);
    if (!existsSync(dir)) return map;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".meta")) continue;
      const meta = this.readMeta(join(dir, entry));
      if (meta) map.set(meta.path, meta);
    }
    return map;
  }

  /** List snapshots for a session, newest-first. */
  listSnapshots(sessionID: string): SnapshotDescriptor[] {
    const dir = this.sessionDir(sessionID);
    if (!existsSync(dir)) return [];
    const out: SnapshotDescriptor[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith("_")) continue; // skip _pending / _redo
      out.push(this.describe(sessionID, entry));
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Discard everything for a session — used when a session is deleted. */
  cleanup(sessionID: string): void {
    try {
      rmSync(this.sessionDir(sessionID), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }

  /** Report the on-disk path this store is rooted at — useful for the config debug view. */
  location(): string {
    return this.baseDir;
  }
}

// Kept exported for callers that want to log root-relative paths.
export function relPath(root: string, path: string): string {
  return relative(root, path) || basename(path);
}
