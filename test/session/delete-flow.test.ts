import { describe, expect, test } from "bun:test";
import { performDelete, type DeleteChoice } from "../../src/session/deleteFlow.ts";
import type { SessionStore } from "../../src/session/store.ts";

interface StoreMock {
  deleteChecked: (id: string) => { ok: true } | { ok: false; error: string };
  retryRm: (id: string) => { ok: true } | { ok: false; error: string };
  moveToTrash: (id: string) => { ok: true; path: string } | { ok: false; error: string };
  unlinkMetadataOnly: (id: string) => { ok: true } | { ok: false; error: string };
}

function makeStore(script: {
  deleteChecked?: Array<{ ok: true } | { ok: false; error: string }>;
  retryRm?: Array<{ ok: true } | { ok: false; error: string }>;
  moveToTrash?: Array<{ ok: true; path: string } | { ok: false; error: string }>;
  unlinkMetadataOnly?: Array<{ ok: true } | { ok: false; error: string }>;
}): StoreMock {
  const dq = [...(script.deleteChecked ?? [])];
  const rq = [...(script.retryRm ?? [])];
  const tq = [...(script.moveToTrash ?? [])];
  const mq = [...(script.unlinkMetadataOnly ?? [])];
  return {
    deleteChecked: () => dq.shift() ?? { ok: true },
    retryRm: () => rq.shift() ?? { ok: true },
    moveToTrash: () => tq.shift() ?? { ok: true, path: "/trash/x" },
    unlinkMetadataOnly: () => mq.shift() ?? { ok: true },
  };
}

function asker(choices: DeleteChoice[]): { fn: (ctx: { error: string; attempt: number }) => Promise<DeleteChoice>; log: Array<{ error: string; attempt: number }> } {
  const log: Array<{ error: string; attempt: number }> = [];
  const q = [...choices];
  return {
    fn: async ({ error, attempt }) => {
      log.push({ error, attempt });
      return q.shift() ?? "cancel";
    },
    log,
  };
}

describe("performDelete orchestrator", () => {
  test("success on first call → no ask; outcome=deleted", async () => {
    const s = makeStore({});
    const a = asker([]);
    const result = await performDelete(s as unknown as SessionStore, "ses_1", a.fn);
    expect(result.outcome).toBe("deleted");
    expect(a.log).toEqual([]);
  });

  test("rm fails, retry succeeds → ask once with the error", async () => {
    const s = makeStore({
      deleteChecked: [{ ok: false, error: "EACCES" }],
      retryRm: [{ ok: true }],
    });
    const a = asker(["retry"]);
    const result = await performDelete(s as unknown as SessionStore, "ses_1", a.fn);
    expect(result.outcome).toBe("deleted");
    expect(a.log).toEqual([{ error: "EACCES", attempt: 1 }]);
  });

  test("rm fails, user picks trash, trash succeeds → outcome=trashed with path", async () => {
    const s = makeStore({
      deleteChecked: [{ ok: false, error: "EACCES" }],
      moveToTrash: [{ ok: true, path: "/data/trash/1-ses_1" }],
    });
    const a = asker(["trash"]);
    const result = await performDelete(s as unknown as SessionStore, "ses_1", a.fn);
    expect(result).toEqual({ outcome: "trashed", path: "/data/trash/1-ses_1" });
  });

  test("rm fails, trash fails, user picks metadata → outcome=metadata-only", async () => {
    const s = makeStore({
      deleteChecked: [{ ok: false, error: "EACCES" }],
      moveToTrash: [{ ok: false, error: "EROFS" }],
      unlinkMetadataOnly: [{ ok: true }],
    });
    const a = asker(["trash", "metadata"]);
    const result = await performDelete(s as unknown as SessionStore, "ses_1", a.fn);
    expect(result.outcome).toBe("metadata-only");
    expect(a.log.map((e) => e.error)).toEqual(["EACCES", "EROFS"]);
  });

  test("user picks cancel on the first ask → outcome=cancelled preserves lastError", async () => {
    const s = makeStore({ deleteChecked: [{ ok: false, error: "EBUSY" }] });
    const a = asker(["cancel"]);
    const result = await performDelete(s as unknown as SessionStore, "ses_1", a.fn);
    expect(result).toEqual({ outcome: "cancelled", lastError: "EBUSY" });
  });

  test("orchestrator never infinite-loops: 10 consecutive failures returns cancelled", async () => {
    const failures = Array.from({ length: 20 }, () => ({ ok: false as const, error: "EAGAIN" }));
    const s = makeStore({ deleteChecked: [{ ok: false, error: "EACCES" }], retryRm: failures });
    const a = asker(Array.from({ length: 20 }, () => "retry" as DeleteChoice));
    const result = await performDelete(s as unknown as SessionStore, "ses_1", a.fn);
    expect(result.outcome).toBe("cancelled");
    // At most 10 asks (initial ask counts as attempt 1; loop caps at 10).
    expect(a.log.length).toBeLessThanOrEqual(10);
  });
});
