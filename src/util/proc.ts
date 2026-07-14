/**
 * Process spawning over node:child_process — replaces Bun.spawn so the
 * published bundle runs under plain Node (and still runs fine under Bun).
 *
 * Reliability contract (a coding assistant must "run anywhere" without wedging):
 *  - The child is spawned in its OWN process group (detached on POSIX) so a
 *    timeout/abort kills the whole tree — a backgrounded grandchild (`cmd &`,
 *    a dev server) can't survive and hold the pipe open.
 *  - We settle on the direct child's `exit`, not on stdio `close`: `close`
 *    waits for every inherited pipe to reach EOF, which a backgrounded child
 *    keeps open forever. `close` is still preferred WHEN it arrives promptly
 *    (full output); otherwise a short grace after `exit` finishes us.
 *  - Captured output is byte-capped so a runaway producer can't OOM the process.
 */
import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  /** True when output hit `maxOutputBytes` and the child was killed early. */
  truncated: boolean;
}

/** Per-stream capture cap; beyond this the child is killed and output flagged. */
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB
/** How long to wait for stdio to drain after the child exits before giving up. */
const CLOSE_GRACE_MS = 150;

export function spawnCapture(
  argv: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxOutputBytes?: number;
  } = {},
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const [command, ...args] = argv;
    const posix = process.platform !== "win32";
    const child = spawn(command!, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: posix, // own process group so we can kill the whole tree
    });

    const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let stdout = "";
    let stderr = "";
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let truncated = false;
    let settled = false;
    let exited = false;
    let exitCode = 1;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const killTree = () => {
      try {
        if (posix && child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (outBytes >= maxBytes) return;
      outBytes += chunk.length;
      stdout += chunk.toString();
      if (outBytes >= maxBytes) {
        truncated = true;
        killTree();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errBytes >= maxBytes) return;
      errBytes += chunk.length;
      stderr += chunk.toString();
      if (errBytes >= maxBytes) {
        truncated = true;
        killTree();
      }
    });

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree();
        }, options.timeoutMs)
      : undefined;

    const onAbort = () => killTree();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      options.signal?.removeEventListener("abort", onAbort);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({ stdout, stderr, exitCode: code, timedOut, truncated });
    };

    child.on("error", (error) => {
      stderr += String(error);
      finish(127);
    });

    // The direct child has terminated. Prefer `close` (all stdio drained → full
    // output) if it lands within the grace window; otherwise a backgrounded
    // grandchild is holding the pipe, so finish with what we have.
    child.on("exit", (code, signal) => {
      exited = true;
      exitCode = code ?? (signal ? 137 : 1);
      graceTimer = setTimeout(() => finish(exitCode), CLOSE_GRACE_MS);
    });
    child.on("close", (code) => finish(exited ? exitCode : (code ?? 1)));
  });
}
