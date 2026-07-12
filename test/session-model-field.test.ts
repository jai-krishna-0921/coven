import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/session/store.ts";

describe("SessionInfo.model", () => {
  test("model override round-trips through disk", () => {
    const data = mkdtempSync(join(tmpdir(), "coven-sess-")); // SessionStore(root, dataDir?)
    const store = new SessionStore(process.cwd(), data);
    const s = store.create({ agent: "builder", title: "t" });
    store.update({ ...s, model: "openai/gpt-5.4" });
    // reload from disk with a fresh instance to prove real persistence:
    const reloaded = new SessionStore(process.cwd(), data);
    expect(reloaded.get(s.id)?.model).toBe("openai/gpt-5.4");
    rmSync(data, { recursive: true, force: true });
  });
});
