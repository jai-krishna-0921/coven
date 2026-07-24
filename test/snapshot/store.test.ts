import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotStore } from "../../src/snapshot/index.ts";

function tmpProject(): { root: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "coven-snap-root-"));
  const data = mkdtempSync(join(tmpdir(), "coven-snap-data-"));
  return { root, data };
}

describe("SnapshotStore.captureFile + snapshot + revert", () => {
  test("revert restores pre-write file content", () => {
    const { root, data } = tmpProject();
    const store = new SnapshotStore(root, data);
    const target = join(root, "a.txt");
    writeFileSync(target, "original");

    store.captureFile("ses_1", target);
    writeFileSync(target, "mutated");
    const snap = store.snapshot("ses_1", "msg_1");
    expect(snap.id).toBe("msg_1");
    expect(snap.files.length).toBe(1);

    // Simulate another later change we do NOT want reverted.
    writeFileSync(target, "third");

    store.revert("ses_1", "msg_1");
    expect(readFileSync(target, "utf8")).toBe("original");
  });

  test("revert restores absence when the file was created after capture", () => {
    const { root, data } = tmpProject();
    const store = new SnapshotStore(root, data);
    const created = join(root, "created.txt");

    // captureFile records "did not exist"
    store.captureFile("ses_2", created);
    writeFileSync(created, "hello");
    store.snapshot("ses_2", "msg_2");

    store.revert("ses_2", "msg_2");
    expect(existsSync(created)).toBe(false);
  });

  test("multiple files captured within one snapshot revert together", () => {
    const { root, data } = tmpProject();
    const store = new SnapshotStore(root, data);
    mkdirSync(join(root, "sub"), { recursive: true });
    const a = join(root, "a.txt");
    const b = join(root, "sub", "b.txt");
    writeFileSync(a, "A0");
    writeFileSync(b, "B0");

    store.captureFile("ses_3", a);
    store.captureFile("ses_3", b);
    writeFileSync(a, "A1");
    writeFileSync(b, "B1");
    store.snapshot("ses_3", "msg_3");

    store.revert("ses_3", "msg_3");
    expect(readFileSync(a, "utf8")).toBe("A0");
    expect(readFileSync(b, "utf8")).toBe("B0");
  });

  test("captureFile is a no-op after the same path is already captured in the snapshot", () => {
    // Two writes to the same file within one turn — only the FIRST pre-mutation
    // content is recorded (otherwise the second capture would overwrite it
    // with the intermediate value and revert would only undo the second edit).
    const { root, data } = tmpProject();
    const store = new SnapshotStore(root, data);
    const p = join(root, "x.txt");
    writeFileSync(p, "v0");

    store.captureFile("ses_4", p);
    writeFileSync(p, "v1");
    store.captureFile("ses_4", p); // second capture must NOT clobber "v0"
    writeFileSync(p, "v2");
    store.snapshot("ses_4", "msg_4");

    store.revert("ses_4", "msg_4");
    expect(readFileSync(p, "utf8")).toBe("v0");
  });

  test("revert of a redo-after-revert restores the intermediate state (redo)", () => {
    // The store must retain enough info to redo an undone revert. We snapshot
    // the current file contents right before revert to a `redo` frame, then
    // restore from it on redo().
    const { root, data } = tmpProject();
    const store = new SnapshotStore(root, data);
    const p = join(root, "y.txt");
    writeFileSync(p, "start");

    store.captureFile("ses_5", p);
    writeFileSync(p, "after-turn");
    store.snapshot("ses_5", "msg_5");

    store.revert("ses_5", "msg_5");
    expect(readFileSync(p, "utf8")).toBe("start");

    const redone = store.redo("ses_5");
    expect(redone).toBe(true);
    expect(readFileSync(p, "utf8")).toBe("after-turn");
  });

  test("diff() reports added/removed/changed files between two snapshots", () => {
    const { root, data } = tmpProject();
    const store = new SnapshotStore(root, data);
    const a = join(root, "a.txt");
    const b = join(root, "b.txt");
    const c = join(root, "c.txt");

    // Snapshot m1: only a exists
    writeFileSync(a, "a0");
    store.captureFile("ses_6", a);
    store.captureFile("ses_6", b); // b currently absent
    store.captureFile("ses_6", c); // c currently absent
    store.snapshot("ses_6", "m1");

    // Now: a changed, b added, c stays absent
    writeFileSync(a, "a1");
    writeFileSync(b, "b1");
    store.captureFile("ses_6", a);
    store.captureFile("ses_6", b);
    store.captureFile("ses_6", c);
    store.snapshot("ses_6", "m2");

    const d = store.diff("ses_6", "m1", "m2");
    expect(d.changed).toContain(a);
    expect(d.added).toContain(b);
    expect(d.removed.length).toBe(0);
  });
});
