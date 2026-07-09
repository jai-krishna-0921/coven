/**
 * The agent loop.
 *
 * One user turn = repeat { stream assistant message → execute tool calls →
 * feed results back } until the model finishes without tool calls, the step
 * budget runs out, or the turn is aborted.
 *
 * Tool execution is owned here (not by the provider): each call is validated
 * against its zod schema, gated by the permission engine (with the agent's
 * ruleset appended), wrapped in plugin before/after hooks, and guarded against
 * doom loops (three identical consecutive calls → ask).
 */
import type { AgentRegistry } from "../agent/index.ts";
import type { AgentInfo } from "../agent/types.ts";
import type { Bus } from "../bus/index.ts";
import type { CovenConfig } from "../config/schema.ts";
import { DEFAULT_MAX_STEPS, DEFAULT_MODEL } from "../config/schema.ts";
import { PermissionEngine } from "../permission/index.ts";
import type { Ruleset } from "../permission/types.ts";
import type { ModelContent, ModelMessage, ProviderResolver, ToolSchema } from "../provider/types.ts";
import type { SkillRegistry } from "../skill/index.ts";
import type { PluginHost } from "../plugin/index.ts";
import { ToolRegistry } from "../tool/registry.ts";
import { toJsonSchema, truncateOutput, type ToolContext, type ToolDef, type ToolResult } from "../tool/types.ts";
import { createId } from "../util/id.ts";
import { NamedError, PermissionDeniedError, PermissionRejectedError } from "../util/error.ts";
import { createLogger } from "../util/log.ts";
import { SessionStore } from "./store.ts";
import { assembleSystemPrompt } from "./system.ts";
import { addUsage, type Message, type Part } from "./types.ts";

const log = createLogger("loop");

export interface EngineOptions {
  config: CovenConfig;
  root: string;
  bus: Bus;
  store: SessionStore;
  providers: ProviderResolver;
  agents: AgentRegistry;
  skills: SkillRegistry;
  plugins: PluginHost;
  permissions: PermissionEngine;
}

export class SessionEngine {
  readonly tools = new ToolRegistry();

  constructor(private o: EngineOptions) {
    // Plugin tools join the registry at startup.
    for (const [id, def] of Object.entries(o.plugins.tools())) {
      this.tools.register({
        id,
        description: def.description,
        parameters: def.parameters,
        execute: async (args, ctx) => {
          const result = await def.execute(args, { sessionID: ctx.sessionID, root: ctx.root, abort: ctx.abort });
          return typeof result === "string" ? { title: id, output: result } : result;
        },
      } as ToolDef<never>);
    }
  }

  /** Run one user turn to completion. Returns the final assistant message. */
  async prompt(sessionID: string, text: string, abort: AbortSignal): Promise<Message> {
    const session = this.o.store.get(sessionID);
    if (!session) throw new Error(`No session ${sessionID}`);
    const agent = this.o.agents.get(session.agent);
    if (!agent) throw new Error(`No agent "${session.agent}"`);

    if (session.title === "New session") {
      session.title = text.length > 64 ? text.slice(0, 61) + "…" : text;
    }

    const userMessage: Message = {
      id: createId("msg"),
      sessionID,
      role: "user",
      agent: agent.name,
      parts: [{ id: createId("prt"), type: "text", text }],
      time: Date.now(),
    };
    this.o.store.appendMessage(userMessage);
    this.o.bus.publish({ type: "message.created", message: userMessage });
    this.o.bus.publish({ type: "session.status", sessionID, status: "busy" });

    try {
      return await this.runLoop(sessionID, agent, abort);
    } finally {
      this.o.bus.publish({ type: "session.status", sessionID, status: "idle" });
      this.o.store.update(session);
    }
  }

  private async runLoop(sessionID: string, agent: AgentInfo, abort: AbortSignal): Promise<Message> {
    const session = this.o.store.get(sessionID)!;
    const modelRef = agent.model ?? this.o.config.model ?? DEFAULT_MODEL;
    const { adapter, ref } = this.o.providers.resolve(modelRef);
    const maxSteps = agent.steps ?? this.o.config.max_steps ?? DEFAULT_MAX_STEPS;

    const system = assembleSystemPrompt({
      agent,
      agents: this.o.agents,
      skills: this.o.skills,
      config: this.o.config,
      root: this.o.root,
    });
    const systemExtra = await this.o.plugins.trigger("chat.system", { agent: agent.name }, { system: [] as string[] });
    const fullSystem = [system, ...systemExtra.system].join("\n\n");

    const visibleTools = this.tools.forAgent((permission, pattern) =>
      this.o.permissions.resolve(permission, pattern, agent.permission).action,
    );
    const toolSchemas: ToolSchema[] = visibleTools.map((tool) => ({
      name: tool.id,
      description: tool.description,
      parameters: toJsonSchema(tool.parameters),
    }));

    const params = await this.o.plugins.trigger(
      "chat.params",
      { agent: agent.name, model: modelRef },
      { temperature: agent.temperature, maxTokens: undefined as number | undefined },
    );

    const recentCalls: string[] = [];
    let lastAssistant: Message | undefined;

    for (let step = 0; step < maxSteps; step++) {
      if (abort.aborted) break;

      const assistant: Message = {
        id: createId("msg"),
        sessionID,
        role: "assistant",
        agent: agent.name,
        model: modelRef,
        parts: [],
        time: Date.now(),
      };
      this.o.store.appendMessage(assistant);
      this.o.bus.publish({ type: "message.created", message: assistant });
      lastAssistant = assistant;

      const pendingCalls: { callID: string; tool: string; args: unknown }[] = [];
      const openParts = new Map<string, Part>();
      let finishReason: "stop" | "tool-calls" | "length" = "stop";

      try {
        for await (const event of adapter.stream({
          model: ref.modelID,
          system: fullSystem,
          messages: this.toModelMessages(sessionID, assistant.id),
          tools: toolSchemas,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          abort,
        })) {
          switch (event.type) {
            case "text-start":
            case "reasoning-start": {
              const part: Part =
                event.type === "text-start"
                  ? { id: createId("prt"), type: "text", text: "" }
                  : { id: createId("prt"), type: "reasoning", text: "" };
              openParts.set(event.id, part);
              assistant.parts.push(part);
              break;
            }
            case "text-delta":
            case "reasoning-delta": {
              const part = openParts.get(event.id);
              if (part && (part.type === "text" || part.type === "reasoning")) {
                part.text += event.text;
                this.o.bus.publish({
                  type: "part.delta",
                  sessionID,
                  messageID: assistant.id,
                  partID: part.id,
                  delta: event.text,
                });
              }
              break;
            }
            case "text-end":
            case "reasoning-end": {
              const part = openParts.get(event.id);
              if (part) {
                openParts.delete(event.id);
                this.o.bus.publish({ type: "part.updated", sessionID, messageID: assistant.id, part });
              }
              break;
            }
            case "tool-call": {
              const part: Part = {
                id: createId("prt"),
                type: "tool",
                callID: event.callID,
                tool: event.tool,
                args: event.args,
                status: "pending",
              };
              assistant.parts.push(part);
              pendingCalls.push({ callID: event.callID, tool: event.tool, args: event.args });
              this.o.bus.publish({ type: "part.updated", sessionID, messageID: assistant.id, part });
              break;
            }
            case "finish": {
              finishReason = event.reason;
              assistant.usage = event.usage;
              session.usage = addUsage(session.usage, event.usage);
              break;
            }
          }
        }
      } catch (error) {
        if (abort.aborted) {
          assistant.finish = "aborted";
          this.o.store.updateMessage(assistant);
          break;
        }
        assistant.finish = "error";
        assistant.parts.push({
          id: createId("prt"),
          type: "text",
          text: `[provider error: ${error instanceof Error ? error.message : String(error)}]`,
          synthetic: true,
        });
        this.o.store.updateMessage(assistant);
        this.o.bus.publish({ type: "message.updated", message: assistant });
        throw error;
      }

      assistant.finish = pendingCalls.length > 0 ? "tool-calls" : finishReason === "length" ? "length" : "stop";
      this.o.store.updateMessage(assistant);
      this.o.bus.publish({ type: "message.updated", message: assistant });

      if (pendingCalls.length === 0) break;

      // ---- Execute tool calls sequentially ----
      for (const call of pendingCalls) {
        if (abort.aborted) break;
        const part = assistant.parts.find((p) => p.type === "tool" && p.callID === call.callID);
        if (!part || part.type !== "tool") continue;

        // Doom-loop guard: 3 identical consecutive calls need explicit approval.
        const signature = `${call.tool}:${JSON.stringify(call.args)}`;
        recentCalls.push(signature);
        if (recentCalls.length > 3) recentCalls.shift();
        const doomed = recentCalls.length === 3 && recentCalls.every((s) => s === signature);

        part.status = "running";
        this.o.bus.publish({ type: "part.updated", sessionID, messageID: assistant.id, part });
        this.o.bus.publish({ type: "tool.started", sessionID, callID: call.callID, tool: call.tool });

        const result = await this.executeTool(sessionID, assistant.id, agent, call, doomed, abort);
        part.status = result.isError ? "error" : "completed";
        part.title = result.title;
        part.output = result.output;
        if (result.isError) part.error = result.output;
        this.o.store.updateMessage(assistant);
        this.o.bus.publish({ type: "part.updated", sessionID, messageID: assistant.id, part });
        this.o.bus.publish({
          type: "tool.finished",
          sessionID,
          callID: call.callID,
          tool: call.tool,
          status: result.isError ? "error" : "completed",
        });
      }

      if (step === maxSteps - 1) {
        log.warn("max steps reached", { sessionID, maxSteps });
      }
    }

    return lastAssistant ?? this.o.store.messagesOf(sessionID).at(-1)!;
  }

  private async executeTool(
    sessionID: string,
    messageID: string,
    agent: AgentInfo,
    call: { callID: string; tool: string; args: unknown },
    doomed: boolean,
    abort: AbortSignal,
  ): Promise<ToolResult & { isError?: boolean }> {
    const tool = this.tools.get(call.tool);
    if (!tool) {
      return { title: call.tool, output: `Error: unknown tool "${call.tool}".`, isError: true };
    }

    const parsed = tool.parameters.safeParse(call.args);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        title: call.tool,
        output: `Invalid arguments for "${call.tool}": ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "invalid"}. Rewrite the input to match the schema.`,
        isError: true,
      };
    }

    const agentRules: Ruleset = agent.permission;
    const ctx: ToolContext = {
      sessionID,
      messageID,
      callID: call.callID,
      agent: agent.name,
      root: this.o.root,
      abort,
      messages: this.o.store.messagesOf(sessionID),
      ask: async (input) => {
        // Plugins get first say (auto-allow / auto-deny policies).
        const verdict = await this.o.plugins.trigger(
          "permission.ask",
          { id: "", sessionID, permission: input.permission, patterns: input.patterns, title: input.title },
          { action: "ask" as "allow" | "ask" | "deny" },
        );
        if (verdict.action === "allow") return;
        if (verdict.action === "deny") throw new PermissionDeniedError(input.permission, input.patterns[0] ?? "*");
        await this.o.permissions.ask(sessionID, input, agentRules);
      },
      progress: (title) => {
        this.o.bus.publish({ type: "tool.started", sessionID, callID: call.callID, tool: title });
      },
      spawnSubagent: (input) => this.spawnSubagent(sessionID, input, abort),
      loadSkill: (name) => {
        const skill = this.o.skills.get(name);
        return skill ? { content: skill.content, dir: skill.dir } : undefined;
      },
    };

    try {
      if (doomed) {
        await ctx.ask({
          permission: "doom_loop",
          patterns: [call.tool],
          title: `Loop detected: "${call.tool}" called 3× with identical arguments — continue?`,
        });
      }
      const before = await this.o.plugins.trigger(
        "tool.execute.before",
        { tool: call.tool, sessionID, callID: call.callID },
        { args: parsed.data as unknown },
      );
      const raw = await tool.execute(before.args as never, ctx);
      const after = await this.o.plugins.trigger(
        "tool.execute.after",
        { tool: call.tool, sessionID, callID: call.callID, args: before.args },
        { ...raw, output: truncateOutput(raw.output) },
      );
      return after;
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof PermissionRejectedError) {
        return { title: call.tool, output: `${error.message}. Adjust your approach — do not retry the same call.`, isError: true };
      }
      const message = error instanceof NamedError ? error.message : error instanceof Error ? error.message : String(error);
      log.error("tool execution failed", { tool: call.tool, error: message });
      return { title: call.tool, output: `Error: ${message}`, isError: true };
    }
  }

  /** Subagent = child session run to completion; returns its final report text. */
  private async spawnSubagent(
    parentID: string,
    input: { agent: string; prompt: string; description: string },
    abort: AbortSignal,
  ): Promise<string> {
    const agentInfo = this.o.agents.get(input.agent);
    if (!agentInfo) {
      const available = this.o.agents
        .subagents()
        .map((a) => a.name)
        .join(", ");
      return `Error: no agent "${input.agent}". Available subagents: ${available}`;
    }
    if (agentInfo.mode === "primary") {
      return `Error: agent "${input.agent}" is primary-only and cannot be dispatched as a subagent.`;
    }
    const child = this.o.store.create({ agent: input.agent, parentID, title: input.description });
    this.o.bus.publish({ type: "session.created", session: child });
    const final = await this.prompt(child.id, input.prompt, abort);
    const text = final.parts
      .filter((p) => p.type === "text" && !p.synthetic)
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim();
    return text || "(subagent returned no text)";
  }

  /** Convert stored history to provider-agnostic model messages. */
  private toModelMessages(sessionID: string, excludeMessageID: string): ModelMessage[] {
    const out: ModelMessage[] = [];
    for (const message of this.o.store.messagesOf(sessionID)) {
      if (message.id === excludeMessageID) continue;
      if (message.role === "user") {
        const text = message.parts
          .filter((p) => p.type === "text")
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("\n");
        if (text) out.push({ role: "user", content: [{ type: "text", text }] });
        continue;
      }
      // Assistant: text + tool calls, then tool results as a following user message.
      const content: ModelContent[] = [];
      const results: ModelContent[] = [];
      for (const part of message.parts) {
        if (part.type === "text" && part.text) {
          content.push({ type: "text", text: part.text });
        } else if (part.type === "tool") {
          content.push({ type: "tool-call", callID: part.callID, tool: part.tool, args: part.args });
          results.push({
            type: "tool-result",
            callID: part.callID,
            output: part.output ?? part.error ?? "(no result — interrupted)",
            isError: part.status === "error",
          });
        }
      }
      if (content.length > 0) out.push({ role: "assistant", content });
      if (results.length > 0) out.push({ role: "user", content: results });
    }
    return out;
  }
}
