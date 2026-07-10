import { describe, expect, test } from "bun:test";
import {
  buildSummaryPrompt,
  estimateTokens,
  filterCompacted,
  isOverflow,
  pruneToolOutputs,
  selectCompaction,
  usableTokens,
  PRUNE_MINIMUM,
} from "../src/session/context.ts";
import type { Message, Part } from "../src/session/types.ts";

let counter = 0;
function msg(role: "user" | "assistant", parts: Part[], extra: Partial<Message> = {}): Message {
  counter++;
  return {
    id: `msg_${String(counter).padStart(4, "0")}`,
    sessionID: "ses_test",
    role,
    agent: "builder",
    parts,
    time: counter,
    ...extra,
  };
}

function textPart(text: string): Part {
  return { id: `prt_${++counter}`, type: "text", text };
}

function toolPart(tool: string, output: string): Part {
  return { id: `prt_${++counter}`, type: "tool", callID: `c${counter}`, tool, args: {}, status: "completed", output };
}

describe("estimateTokens / usableTokens / isOverflow", () => {
  test("chars over four, rounded up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  test("usable reserves min(20k, outputLimit)", () => {
    expect(usableTokens({ contextLimit: 200_000, outputLimit: 32_000 })).toBe(180_000);
    expect(usableTokens({ contextLimit: 200_000, outputLimit: 8_000 })).toBe(192_000);
  });

  test("overflow at the usable boundary", () => {
    const limits = { contextLimit: 200_000, outputLimit: 32_000 };
    expect(isOverflow(179_999, limits)).toBe(false);
    expect(isOverflow(180_000, limits)).toBe(true);
    expect(isOverflow(999_999, { contextLimit: 0, outputLimit: 0 })).toBe(false); // unknown window → never
  });
});

describe("pruneToolOutputs", () => {
  const BIG = "x".repeat(200_000); // 50k tokens each

  test("prunes old outputs beyond the protected budget", () => {
    const messages = [
      msg("user", [textPart("turn 1")]),
      msg("assistant", [toolPart("bash", BIG), toolPart("bash", BIG)]),
      msg("user", [textPart("turn 2")]),
      msg("assistant", [toolPart("bash", BIG)]),
      msg("user", [textPart("turn 3")]),
      msg("assistant", [toolPart("bash", "small output")]),
    ];
    const freed = pruneToolOutputs(messages);
    expect(freed).toBeGreaterThan(PRUNE_MINIMUM);
    // The two most recent user turns are untouched.
    const last = messages[5]!.parts[0]!;
    expect(last.type === "tool" && last.prunedAt).toBeUndefined();
    // Oldest big output got pruned (protected budget consumed by newer ones).
    const oldest = messages[1]!.parts[0]!;
    expect(oldest.type === "tool" && oldest.prunedAt).toBeDefined();
  });

  test("does nothing below the hysteresis minimum", () => {
    const messages = [
      msg("user", [textPart("t1")]),
      msg("assistant", [toolPart("bash", "tiny")]),
      msg("user", [textPart("t2")]),
      msg("assistant", [textPart("done")]),
      msg("user", [textPart("t3")]),
    ];
    expect(pruneToolOutputs(messages)).toBe(0);
  });

  test("protected tools are never pruned", () => {
    const messages = [
      msg("user", [textPart("t1")]),
      msg("assistant", [toolPart("skill", BIG), toolPart("bash", BIG), toolPart("bash", BIG), toolPart("bash", BIG)]),
      msg("user", [textPart("t2")]),
      msg("user", [textPart("t3")]),
    ];
    pruneToolOutputs(messages);
    const skillPart = messages[1]!.parts[0]!;
    expect(skillPart.type === "tool" && skillPart.prunedAt).toBeUndefined();
  });

  test("stops at a compaction summary boundary", () => {
    const messages = [
      msg("user", [textPart("ancient")]),
      msg("assistant", [toolPart("bash", BIG)]),
      msg("assistant", [textPart("summary text")], { summary: true, finish: "stop" }),
      msg("user", [textPart("t2")]),
      msg("user", [textPart("t3")]),
      msg("user", [textPart("t4")]),
    ];
    expect(pruneToolOutputs(messages)).toBe(0); // walk stops before crossing the summary
  });
});

describe("selectCompaction", () => {
  test("keeps recent turns as tail, older as head", () => {
    const messages = [
      msg("user", [textPart("old question")]),
      msg("assistant", [textPart("old answer")]),
      msg("user", [textPart("recent question")]),
      msg("assistant", [textPart("recent answer")]),
    ];
    const { head, tailStartId } = selectCompaction(messages, { contextLimit: 200_000, outputLimit: 32_000 });
    expect(tailStartId).toBeDefined();
    expect(head.length).toBeLessThan(messages.length);
  });

  test("the last user turn always survives, even when it blows the budget", () => {
    // A huge paste must not be summarized away — that would leave the request
    // ending on an assistant message (illegal prefill → 400) and lose the user's
    // message. The last user turn is kept verbatim regardless of budget.
    const huge = "y".repeat(100_000);
    const lastUser = msg("user", [textPart(huge)]);
    const messages = [msg("user", [textPart("q1")]), msg("assistant", [textPart(huge)]), lastUser, msg("assistant", [textPart(huge)])];
    const { head, tailStartId } = selectCompaction(messages, { contextLimit: 40_000, outputLimit: 8_000 }, 2, 100);
    expect(tailStartId).toBe(lastUser.id);
    expect(head).toHaveLength(2); // everything before the last user turn
  });
});

describe("filterCompacted", () => {
  test("returns history unchanged when no compaction exists", () => {
    const messages = [msg("user", [textPart("hi")]), msg("assistant", [textPart("hello")])];
    expect(filterCompacted(messages)).toEqual(messages);
  });

  test("drops the head, keeps trigger + summary + tail + post messages in order", () => {
    const tail = msg("user", [textPart("recent turn")]);
    const messages = [
      msg("user", [textPart("ancient 1")]),
      msg("assistant", [textPart("ancient 2")]),
      tail,
      msg("assistant", [textPart("recent answer")]),
      msg("user", [textPart("What did we do so far?")], { compaction: { auto: true, tailStartId: tail.id } }),
      msg("assistant", [textPart("## Objective ...")], { summary: true, finish: "stop" }),
      msg("user", [textPart("post-compaction question")]),
    ];
    const visible = filterCompacted(messages);
    const texts = visible.map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""));
    expect(texts[0]).toBe("What did we do so far?");
    expect(texts[1]).toBe("## Objective ...");
    expect(texts[2]).toBe("recent turn");
    expect(texts).not.toContain("ancient 1");
    expect(texts.at(-1)).toBe("post-compaction question");
  });

  test("failed summaries are ignored — history stays intact", () => {
    const messages = [
      msg("user", [textPart("q")]),
      msg("user", [textPart("What did we do so far?")], { compaction: { auto: true } }),
      msg("assistant", [], { summary: true, finish: "error" }),
    ];
    expect(filterCompacted(messages)).toEqual(messages);
  });

  test("a prior compaction's trigger+summary are dropped from the tail (no resurrection)", () => {
    // Second compaction whose retained tail spans an EARLIER compaction pair.
    const t1 = msg("user", [textPart("What did we do so far?")], { compaction: { auto: true } });
    const s1 = msg("assistant", [textPart("## old summary")], { summary: true, finish: "stop" });
    const recent = msg("user", [textPart("recent turn")]);
    const t2 = msg("user", [textPart("What did we do so far?")], { compaction: { auto: true, tailStartId: t1.id } });
    const s2 = msg("assistant", [textPart("## new summary")], { summary: true, finish: "stop" });
    const messages = [msg("user", [textPart("older")]), t1, s1, recent, t2, s2];
    const visible = filterCompacted(messages);
    const texts = visible.map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""));
    // The new summary is present; the OLD trigger/summary are not resurrected.
    expect(texts).toContain("## new summary");
    expect(texts).toContain("recent turn");
    expect(texts).not.toContain("## old summary");
    expect(texts.filter((t) => t === "What did we do so far?")).toHaveLength(1);
  });
});

describe("buildSummaryPrompt", () => {
  test("first-time prompt has no previous-summary block", () => {
    expect(buildSummaryPrompt()).toContain("Create a new anchored summary");
    expect(buildSummaryPrompt()).not.toContain("<previous-summary>");
  });

  test("rolling prompt embeds the previous summary", () => {
    const prompt = buildSummaryPrompt("## Objective\n- old stuff");
    expect(prompt).toContain("<previous-summary>");
    expect(prompt).toContain("old stuff");
    expect(prompt).toContain("Do not mention the summary process");
  });
});
