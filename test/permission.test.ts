import { describe, expect, test } from "bun:test";
import { evaluate, rulesFromConfig, PermissionEngine } from "../src/permission/index.ts";
import type { Ruleset } from "../src/permission/types.ts";
import { Bus } from "../src/bus/index.ts";
import { PermissionDeniedError, PermissionRejectedError } from "../src/util/error.ts";

describe("evaluate", () => {
  test("unmatched requests default to ask", () => {
    expect(evaluate("bash", "rm -rf", []).action).toBe("ask");
  });

  test("last matching rule wins when multiple match", () => {
    const rules: Ruleset = [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "git *", action: "allow" },
    ];
    expect(evaluate("bash", "git status", rules).action).toBe("allow");
    expect(evaluate("bash", "rm x", rules).action).toBe("deny");
  });

  test("later rulesets override earlier ones", () => {
    const baseline: Ruleset = [{ permission: "edit", pattern: "*", action: "allow" }];
    const agent: Ruleset = [{ permission: "edit", pattern: "*", action: "deny" }];
    expect(evaluate("edit", "src/x.ts", baseline, agent).action).toBe("deny");
  });

  test("permission field is wildcard-matched too", () => {
    const rules: Ruleset = [{ permission: "*", pattern: "*", action: "allow" }];
    expect(evaluate("webfetch", "example.com", rules).action).toBe("allow");
  });
});

describe("rulesFromConfig", () => {
  test("string values become star-pattern rules", () => {
    expect(rulesFromConfig({ bash: "ask" })).toEqual([{ permission: "bash", pattern: "*", action: "ask" }]);
  });

  test("object values preserve entry order for last-wins semantics", () => {
    const rules = rulesFromConfig({ bash: { "*": "ask", "git status": "allow" } });
    expect(rules).toHaveLength(2);
    expect(rules[1]).toEqual({ permission: "bash", pattern: "git status", action: "allow" });
  });
});

describe("PermissionEngine.ask", () => {
  test("allow rules resolve without publishing an ask", async () => {
    const bus = new Bus();
    let asked = false;
    bus.subscribe((event) => {
      if (event.type === "permission.asked") asked = true;
    });
    const engine = new PermissionEngine(bus, [{ permission: "read", pattern: "*", action: "allow" }]);
    await engine.ask("ses_1", { permission: "read", patterns: ["src/x.ts"], title: "read" });
    expect(asked).toBe(false);
  });

  test("deny rules throw PermissionDeniedError immediately", async () => {
    const engine = new PermissionEngine(new Bus(), [{ permission: "bash", pattern: "sudo*", action: "deny" }]);
    await expect(engine.ask("ses_1", { permission: "bash", patterns: ["sudo rm"], title: "sudo" })).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  test("ask blocks until replied once, then resolves", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, []);
    bus.subscribe((event) => {
      if (event.type === "permission.asked") engine.reply(event.request.id, "once");
    });
    await engine.ask("ses_1", { permission: "bash", patterns: ["make"], title: "make" });
  });

  test("always settles concurrent identical pendings without a second prompt", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, []);
    let asks = 0;
    bus.subscribe((event) => {
      if (event.type === "permission.asked") asks++;
    });
    // Two concurrent identical asks are pending at once.
    const settled = Promise.all([
      engine.ask("ses_1", { permission: "webfetch", patterns: ["example.com"], title: "a" }),
      engine.ask("ses_1", { permission: "webfetch", patterns: ["example.com"], title: "b" }),
    ]);
    expect(engine.pendingRequests()).toHaveLength(2);
    // Answering the first with "always" resolves BOTH.
    engine.reply(engine.pendingRequests()[0]!.id, "always");
    await settled;
    expect(engine.pendingRequests()).toHaveLength(0);
    expect(asks).toBe(2); // both were published, but only one needed an answer
  });

  test("always persists an allow rule for subsequent asks", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, []);
    let asks = 0;
    bus.subscribe((event) => {
      if (event.type === "permission.asked") {
        asks++;
        engine.reply(event.request.id, "always");
      }
    });
    await engine.ask("ses_1", { permission: "bash", patterns: ["make"], title: "make" });
    await engine.ask("ses_1", { permission: "bash", patterns: ["make"], title: "make again" });
    expect(asks).toBe(1);
  });

  test("reject throws PermissionRejectedError with feedback", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, []);
    bus.subscribe((event) => {
      if (event.type === "permission.asked") engine.reply(event.request.id, "reject", "use the edit tool instead");
    });
    await expect(engine.ask("ses_1", { permission: "bash", patterns: ["sed -i"], title: "sed" })).rejects.toThrow(
      /use the edit tool instead/,
    );
  });

  test("reject cascades to other pending asks in the same session", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, []);
    // allSettled attaches handlers before reply() rejects, avoiding unhandled-rejection noise.
    const settled = Promise.allSettled([
      engine.ask("ses_1", { permission: "bash", patterns: ["a"], title: "a" }),
      engine.ask("ses_1", { permission: "bash", patterns: ["b"], title: "b" }),
    ]);
    const firstId = engine.pendingRequests()[0]!.id;
    engine.reply(firstId, "reject");
    const [first, second] = await settled;
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(PermissionRejectedError);
  });

  test("agent rules append after baseline and win", async () => {
    const engine = new PermissionEngine(new Bus(), [{ permission: "edit", pattern: "*", action: "allow" }]);
    const agentRules: Ruleset = [{ permission: "edit", pattern: "*", action: "deny" }];
    await expect(
      engine.ask("ses_1", { permission: "edit", patterns: ["x.ts"], title: "edit" }, agentRules),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
