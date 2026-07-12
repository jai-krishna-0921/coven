import { describe, expect, test } from "bun:test";
import type { BusEvent } from "../src/bus/index.ts";
import { makeEngine } from "./util/fake-engine.ts";

function collectUpdated(bus: { subscribe(cb: (e: BusEvent) => void): () => void }): BusEvent[] {
  const events: BusEvent[] = [];
  bus.subscribe((e) => {
    if (e.type === "session.updated") events.push(e);
  });
  return events;
}

describe("SessionEngine setters", () => {
  test("setModel persists the model ref and publishes session.updated", async () => {
    const { engine, store, bus } = await makeEngine();
    const s = store.create({ agent: "builder" });
    const events = collectUpdated(bus);

    const updated = engine.setModel(s.id, "openai/gpt-5.4");
    expect(updated.model).toBe("openai/gpt-5.4");
    expect(store.get(s.id)!.model).toBe("openai/gpt-5.4");
    expect(events).toContainEqual({ type: "session.updated", session: updated });
  });

  test("setModel rejects a ref without a provider slash", async () => {
    const { engine, store } = await makeEngine();
    const s = store.create({ agent: "builder" });
    expect(() => engine.setModel(s.id, "noslash")).toThrow();
  });

  test("setAgent switches to a user-selectable agent and publishes session.updated", async () => {
    const { engine, store, bus } = await makeEngine();
    const s = store.create({ agent: "builder" });
    const events = collectUpdated(bus);

    const updated = engine.setAgent(s.id, "planner");
    expect(updated.agent).toBe("planner");
    expect(store.get(s.id)!.agent).toBe("planner");
    expect(events).toContainEqual({ type: "session.updated", session: updated });
  });

  test("setAgent rejects a subagent-only agent", async () => {
    const { engine, store } = await makeEngine();
    const s = store.create({ agent: "builder" });
    expect(() => engine.setAgent(s.id, "researcher")).toThrow();
  });

  test("setAgent rejects an unknown agent", async () => {
    const { engine, store } = await makeEngine();
    const s = store.create({ agent: "builder" });
    expect(() => engine.setAgent(s.id, "nope")).toThrow();
  });
});
