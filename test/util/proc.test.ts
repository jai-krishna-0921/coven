import { describe, expect, test } from "bun:test";
import { spawnCapture } from "../../src/util/proc.ts";

describe("spawnCapture", () => {
  test("captures stdout and the exit code of a normal command", async () => {
    const r = await spawnCapture(["bash", "-c", "echo hello; exit 3"], { timeoutMs: 5_000 });
    expect(r.stdout).toContain("hello");
    expect(r.exitCode).toBe(3);
    expect(r.timedOut).toBe(false);
  });

  test("does not hang when the parent exits but a child backgrounds and holds the pipe", async () => {
    const start = Date.now();
    const r = await spawnCapture(["bash", "-c", "sleep 5 & echo done"], { timeoutMs: 10_000 });
    const elapsed = Date.now() - start;
    expect(r.stdout).toContain("done");
    // Old behaviour waited ~5s for the backgrounded sleep to release the pipe.
    expect(elapsed).toBeLessThan(3_000);
  });

  test("timeout kills the whole process group, not just the shell", async () => {
    const start = Date.now();
    const r = await spawnCapture(["bash", "-c", "sleep 30"], { timeoutMs: 400 });
    const elapsed = Date.now() - start;
    expect(r.timedOut).toBe(true);
    // Old behaviour orphaned the sleep, which held the pipe for the full 30s.
    expect(elapsed).toBeLessThan(3_000);
  });

  test("caps captured output and flags truncation instead of buffering unbounded", async () => {
    const r = await spawnCapture(["bash", "-c", "yes covenfill | head -c 5000000"], {
      timeoutMs: 10_000,
      maxOutputBytes: 100_000,
    });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(400_000);
  });
});
