import { describe, expect, test } from "bun:test";
import { Bus } from "../src/bus/index.ts";
import { QuestionEngine } from "../src/question/index.ts";
import type { QuestionRequest } from "../src/question/types.ts";
import { QuestionCancelledError } from "../src/util/error.ts";

function bus() {
  const b = new Bus();
  const asked: QuestionRequest[] = [];
  const replied: string[] = [];
  b.subscribe((e) => {
    if (e.type === "question.asked") asked.push(e.request);
    if (e.type === "question.replied") replied.push(e.requestID);
  });
  return { b, asked, replied };
}

describe("QuestionEngine", () => {
  test("ask publishes question.asked, reply resolves with values", async () => {
    const { b, asked, replied } = bus();
    const engine = new QuestionEngine(b);
    const promise = engine.ask("ses_1", { title: "pick one", choices: ["a", "b"] });
    expect(asked.length).toBe(1);
    engine.reply(asked[0]!.id, { kind: "answer", values: ["a"] });
    await expect(promise).resolves.toEqual(["a"]);
    expect(replied).toEqual([asked[0]!.id]);
  });

  test("reply cancel rejects with QuestionCancelledError carrying feedback", async () => {
    const { b, asked } = bus();
    const engine = new QuestionEngine(b);
    const promise = engine.ask("ses_1", { title: "pick", choices: ["a"] });
    engine.reply(asked[0]!.id, { kind: "cancel", feedback: "user declined" });
    await expect(promise).rejects.toThrow(QuestionCancelledError);
    await expect(promise).rejects.toThrow(/user declined/);
  });

  test("abort signal rejects pending ask and publishes a cancel echo", async () => {
    const { b, asked, replied } = bus();
    const engine = new QuestionEngine(b);
    const abort = new AbortController();
    const promise = engine.ask("ses_1", { title: "pick", choices: ["a"] }, abort.signal);
    expect(asked.length).toBe(1);
    abort.abort();
    await expect(promise).rejects.toThrow(QuestionCancelledError);
    expect(replied).toEqual([asked[0]!.id]);
  });

  test("already-aborted signal rejects synchronously without publishing", async () => {
    const { b, asked } = bus();
    const engine = new QuestionEngine(b);
    const abort = new AbortController();
    abort.abort();
    await expect(engine.ask("ses_1", { title: "x", choices: [] }, abort.signal)).rejects.toThrow(QuestionCancelledError);
    expect(asked).toEqual([]);
  });

  test("pendingRequests reflects the queue and empties on reply", () => {
    const { b, asked } = bus();
    const engine = new QuestionEngine(b);
    void engine.ask("ses_1", { title: "one", choices: [] }).catch(() => {});
    void engine.ask("ses_1", { title: "two", choices: [] }).catch(() => {});
    expect(engine.pendingRequests().length).toBe(2);
    engine.reply(asked[0]!.id, { kind: "cancel" });
    expect(engine.pendingRequests().length).toBe(1);
  });

  test("reply on unknown id is a no-op (idempotent)", () => {
    const { b } = bus();
    const engine = new QuestionEngine(b);
    expect(() => engine.reply("q_ghost", { kind: "cancel" })).not.toThrow();
  });
});
