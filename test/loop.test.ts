import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../src/agent/index.ts";
import { Bus } from "../src/bus/index.ts";
import { PermissionEngine } from "../src/permission/index.ts";
import type { Ruleset } from "../src/permission/types.ts";
import { PluginHost } from "../src/plugin/index.ts";
import type { LLMEvent, ProviderResolver, StreamInput } from "../src/provider/types.ts";
import { SessionEngine } from "../src/session/loop.ts";
import { SessionStore } from "../src/session/store.ts";
import { SkillRegistry } from "../src/skill/index.ts";
import { EMPTY_USAGE } from "../src/session/types.ts";

/** Scripted provider: each stream() call plays the next batch of events. */
class FakeProvider implements ProviderResolver {
  received: StreamInput[] = [];
  private step = 0;

  constructor(private script: LLMEvent[][]) {}

  resolve(modelRef: string) {
    const self = this;
    return {
      ref: { providerID: "fake", modelID: modelRef },
      adapter: {
        id: "fake",
        async *stream(input: StreamInput): AsyncGenerator<LLMEvent, void, void> {
          self.received.push(input);
          const events = self.script[self.step++] ?? [];
          for (const event of events) yield event;
        },
      },
    };
  }
}

function textTurn(text: string): LLMEvent[] {
  return [
    { type: "text-start", id: "t0" },
    { type: "text-delta", id: "t0", text },
    { type: "text-end", id: "t0" },
    { type: "finish", reason: "stop", usage: { ...EMPTY_USAGE } },
  ];
}

async function makeEngine(script: LLMEvent[][], baseline: Ruleset, root?: string) {
  const dir = root ?? mkdtempSync(join(tmpdir(), "coven-loop-"));
  const dataDir = mkdtempSync(join(tmpdir(), "coven-data-"));
  const bus = new Bus();
  const provider = new FakeProvider(script);
  const store = new SessionStore(dir, dataDir);
  const engine = new SessionEngine({
    config: { model: "fake/model" },
    root: dir,
    bus,
    store,
    providers: provider,
    agents: new AgentRegistry({}, dir),
    skills: await SkillRegistry.load({}, dir),
    plugins: await PluginHost.load({}, dir, bus),
    permissions: new PermissionEngine(bus, baseline),
  });
  return { engine, store, bus, provider, dir };
}

const ALLOW_ALL: Ruleset = [{ permission: "*", pattern: "*", action: "allow" }];

describe("SessionEngine loop", () => {
  test("text-only turn produces one assistant message and stops", async () => {
    const { engine, store } = await makeEngine([textTurn("hello there")], ALLOW_ALL);
    const session = store.create({ agent: "builder" });
    const final = await engine.prompt(session.id, "hi", new AbortController().signal);
    expect(final.finish).toBe("stop");
    expect(final.parts.some((p) => p.type === "text" && p.text === "hello there")).toBe(true);
    expect(store.messagesOf(session.id)).toHaveLength(2); // user + assistant
  });

  test("tool call executes and its result is fed back to the model", async () => {
    const { engine, store, provider, dir } = await makeEngine(
      [
        [
          { type: "tool-call", callID: "c1", tool: "read", args: { filePath: "hello.txt" } },
          { type: "finish", reason: "tool-calls", usage: { ...EMPTY_USAGE } },
        ],
        textTurn("file read complete"),
      ],
      ALLOW_ALL,
    );
    writeFileSync(join(dir, "hello.txt"), "greetings from disk");
    const session = store.create({ agent: "builder" });
    const final = await engine.prompt(session.id, "read hello.txt", new AbortController().signal);

    expect(final.finish).toBe("stop");
    // The second stream call must have received the tool result in history.
    const secondInput = provider.received[1]!;
    const flattened = JSON.stringify(secondInput.messages);
    expect(flattened).toContain("greetings from disk");
    // Tool part on the first assistant message is completed.
    const assistant = store.messagesOf(session.id)[1]!;
    const toolPart = assistant.parts.find((p) => p.type === "tool");
    expect(toolPart?.type === "tool" && toolPart.status).toBe("completed");
  });

  test("denied tool call becomes an error result and the loop continues", async () => {
    const deny: Ruleset = [...ALLOW_ALL, { permission: "edit", pattern: "*", action: "deny" }];
    const { engine, store } = await makeEngine(
      [
        [
          { type: "tool-call", callID: "c1", tool: "write", args: { filePath: "x.txt", content: "data" } },
          { type: "finish", reason: "tool-calls", usage: { ...EMPTY_USAGE } },
        ],
        textTurn("understood, adjusting"),
      ],
      deny,
    );
    const session = store.create({ agent: "builder" });
    const final = await engine.prompt(session.id, "write a file", new AbortController().signal);
    const assistant = store.messagesOf(session.id)[1]!;
    const toolPart = assistant.parts.find((p) => p.type === "tool");
    expect(toolPart?.type === "tool" && toolPart.status).toBe("error");
    expect(toolPart?.type === "tool" && toolPart.output).toContain("Permission denied");
    expect(final.finish).toBe("stop");
  });

  test("invalid tool args return a schema error to the model instead of crashing", async () => {
    const { engine, store } = await makeEngine(
      [
        [
          { type: "tool-call", callID: "c1", tool: "read", args: { wrong: true } },
          { type: "finish", reason: "tool-calls", usage: { ...EMPTY_USAGE } },
        ],
        textTurn("fixing my arguments"),
      ],
      ALLOW_ALL,
    );
    const session = store.create({ agent: "builder" });
    await engine.prompt(session.id, "go", new AbortController().signal);
    const assistant = store.messagesOf(session.id)[1]!;
    const toolPart = assistant.parts.find((p) => p.type === "tool");
    expect(toolPart?.type === "tool" && toolPart.output).toContain("Invalid arguments");
  });

  test("three identical calls trigger the doom-loop ask", async () => {
    const call = (id: string): LLMEvent[] => [
      { type: "tool-call", callID: id, tool: "ls", args: { path: "." } },
      { type: "finish", reason: "tool-calls", usage: { ...EMPTY_USAGE } },
    ];
    // Like production BASELINE_RULES: everything allowed EXCEPT doom_loop still asks.
    const rules: Ruleset = [...ALLOW_ALL, { permission: "doom_loop", pattern: "*", action: "ask" }];
    const { engine, store, bus } = await makeEngine([call("c1"), call("c2"), call("c3"), textTurn("ok stopping")], rules);
    const doomAsks: string[] = [];
    const permissions = (engine as unknown as { o: { permissions: PermissionEngine } }).o.permissions;
    // Record doom asks and auto-reject them so the loop can finish.
    bus.subscribe((event) => {
      if (event.type === "permission.asked") {
        if (event.request.permission === "doom_loop") doomAsks.push(event.request.title);
        permissions.reply(event.request.id, "reject");
      }
    });
    const session = store.create({ agent: "builder" });
    await engine.prompt(session.id, "list forever", new AbortController().signal);
    expect(doomAsks.length).toBe(1);
    expect(doomAsks[0]).toContain("Loop detected");
  });

  test("task tool spawns a child session and returns its report", async () => {
    const { engine, store } = await makeEngine(
      [
        [
          {
            type: "tool-call",
            callID: "c1",
            tool: "task",
            args: { subagent: "researcher", description: "scout the repo", prompt: "look around" },
          },
          { type: "finish", reason: "tool-calls", usage: { ...EMPTY_USAGE } },
        ],
        textTurn("child report: nothing suspicious"), // child session's turn
        textTurn("dispatch complete"), // parent's second turn
      ],
      ALLOW_ALL,
    );
    const session = store.create({ agent: "conductor" });
    const final = await engine.prompt(session.id, "delegate", new AbortController().signal);
    expect(final.parts.some((p) => p.type === "text" && p.text === "dispatch complete")).toBe(true);
    const assistant = store.messagesOf(session.id)[1]!;
    const toolPart = assistant.parts.find((p) => p.type === "tool");
    expect(toolPart?.type === "tool" && toolPart.output).toContain("child report: nothing suspicious");
    expect(toolPart?.type === "tool" && toolPart.output).toContain('subagent_report agent="researcher"');
  });

  test("dispatching an unknown subagent returns a helpful roster", async () => {
    const { engine, store } = await makeEngine(
      [
        [
          {
            type: "tool-call",
            callID: "c1",
            tool: "task",
            args: { subagent: "wizard", description: "cast spells", prompt: "abracadabra" },
          },
          { type: "finish", reason: "tool-calls", usage: { ...EMPTY_USAGE } },
        ],
        textTurn("noted"),
      ],
      ALLOW_ALL,
    );
    const session = store.create({ agent: "conductor" });
    await engine.prompt(session.id, "delegate", new AbortController().signal);
    const assistant = store.messagesOf(session.id)[1]!;
    const toolPart = assistant.parts.find((p) => p.type === "tool");
    expect(toolPart?.type === "tool" && toolPart.output).toContain('no agent "wizard"');
    expect(toolPart?.type === "tool" && toolPart.output).toContain("researcher");
  });

  test("read-only agents do not see edit/write tools", async () => {
    const { engine, store, provider } = await makeEngine([textTurn("scouting")], ALLOW_ALL);
    const session = store.create({ agent: "researcher" });
    await engine.prompt(session.id, "look", new AbortController().signal);
    const toolNames = provider.received[0]!.tools.map((t) => t.name);
    expect(toolNames).not.toContain("edit");
    expect(toolNames).not.toContain("write");
    expect(toolNames).toContain("read");
    expect(toolNames).not.toContain("task"); // researcher cannot spawn subagents
  });
});
