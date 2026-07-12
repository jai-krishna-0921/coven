import { describe, expect, test } from "bun:test";
import type { CovenConfig } from "../src/config/schema.ts";
import { makeEngine } from "./util/fake-engine.ts";

// builder gets an agent-level model via config; config.model is the fallback.
const CONFIG: CovenConfig = { model: "config/c", agent: { builder: { model: "agent/m" } } };

describe("runLoop model precedence", () => {
  test("override.model wins over session, agent, and config", async () => {
    const { engine, store, provider } = await makeEngine({ config: CONFIG });
    const s = store.create({ agent: "builder" });
    store.update({ ...s, model: "session/s" });
    await engine.prompt(s.id, "hi", new AbortController().signal, { model: "override/o" });
    expect(provider.lastResolved).toBe("override/o");
  });

  test("session.model wins when there is no override", async () => {
    const { engine, store, provider } = await makeEngine({ config: CONFIG });
    const s = store.create({ agent: "builder" });
    store.update({ ...s, model: "session/s" });
    await engine.prompt(s.id, "hi", new AbortController().signal);
    expect(provider.lastResolved).toBe("session/s");
  });

  test("agent.model wins when there is no override or session model", async () => {
    const { engine, store, provider } = await makeEngine({ config: CONFIG });
    const s = store.create({ agent: "builder" });
    await engine.prompt(s.id, "hi", new AbortController().signal);
    expect(provider.lastResolved).toBe("agent/m");
  });

  test("config.model is the last resort", async () => {
    const { engine, store, provider } = await makeEngine({ config: { model: "config/c" } });
    // researcher has no agent-level model, so resolution falls through to config.
    const s = store.create({ agent: "researcher" });
    await engine.prompt(s.id, "hi", new AbortController().signal);
    expect(provider.lastResolved).toBe("config/c");
  });
});
