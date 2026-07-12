/**
 * The Coven terminal interface.
 *
 * `runTui(app)` is the entry point: it mounts the full-screen Ink {@link AppRoot}
 * when both stdout and stdin are TTYs, and otherwise falls back to the plain
 * line-oriented {@link runFallbackRepl}. It never `process.exit`s while Ink is
 * mounted — the alt-screen restore must run — and never disposes `app` itself
 * (the CLI entry owns `app.dispose()`). The TTY/mount/fallback seams are
 * injectable so the routing is unit-testable without a real terminal.
 *
 * The legacy streaming {@link Tui} class below is retained only until the CLI is
 * rewired to `runTui`; it is removed once `src/index.ts` no longer references it.
 */
import { writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { createElement } from "react";
import { render } from "ink";
import type { App } from "../app.ts";
import type { SessionInfo } from "../session/types.ts";
import type { PermissionRequest } from "../permission/types.ts";
import { bold, cyan, dim, gray, green, magenta, red, yellow } from "../util/ansi.ts";
import { createId } from "../util/id.ts";
import { readAttachment } from "../util/path.ts";
import { scanBashCommand } from "../tool/bash-scan.ts";
import { spawnCapture } from "../util/proc.ts";
import { DEFAULT_MODEL } from "../config/schema.ts";
import { INPUT_EOF, InputReader } from "./input.ts";
import { App as AppRoot } from "./app.tsx";
import { runFallbackRepl } from "./fallback.ts";
import {
  BANNER,
  Spinner,
  StreamRenderer,
  contextBar,
  formatCost,
  formatMs,
  renderDiffPreview,
  statusLine,
  toolFinishLine,
} from "./render.ts";

/** Injectable seams so `runTui`'s routing is testable without a real terminal. */
export interface RunTuiDeps {
  /** Force the TTY decision (defaults to `stdout.isTTY && stdin.isTTY`). */
  isTTY?: boolean;
  /** Override the non-TTY branch (defaults to {@link runFallbackRepl}). */
  fallback?: (app: App) => Promise<void>;
  /** Override the Ink mount branch (defaults to {@link mountInk}). */
  mount?: (app: App) => Promise<void>;
}

/** Mount the full-screen Ink app in the alternate screen; unmount before rethrow. */
async function mountInk(app: App): Promise<void> {
  const instance = render(createElement(AppRoot, { app }), { alternateScreen: true, exitOnCtrlC: false });
  try {
    await instance.waitUntilExit();
  } catch (error) {
    instance.unmount(); // never leave the alt screen mounted on a crash
    throw error;
  }
}

/**
 * Launch the interactive UI. Mounts Ink on a real TTY, else runs the plain-text
 * fallback REPL (piped stdin / CI / dumb terminals). Resolves when the UI exits.
 */
export async function runTui(app: App, deps: RunTuiDeps = {}): Promise<void> {
  const interactive = deps.isTTY ?? Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const fallback = deps.fallback ?? runFallbackRepl;
  const mount = deps.mount ?? mountInk;
  if (!interactive) {
    await fallback(app);
    return;
  }
  await mount(app);
}

interface ToolTrack {
  tool: string;
  title: string;
  startedAt: number;
  args?: unknown;
}

export class Tui {
  private input: InputReader;
  private session: SessionInfo;
  private spinner = new Spinner();
  private renderer: StreamRenderer;
  private abort = new AbortController();
  private busy = false;
  private lastSigint = 0;
  private tools = new Map<string, ToolTrack>();
  /** Serialize concurrent permission asks — parallel tool waves may overlap. */
  private askChain: Promise<void> = Promise.resolve();

  constructor(private app: App) {
    this.input = new InputReader();
    this.renderer = new StreamRenderer((text) => {
      this.spinner.stop();
      process.stdout.write(text);
    });
    const agentName = app.loaded.config.default_agent ?? "builder";
    this.session = app.store.create({ agent: app.agents.get(agentName) ? agentName : "builder" });
    this.wireBus();
    this.refreshCompletions();
  }

  private refreshCompletions(): void {
    const commands = [
      "/help",
      "/agents",
      "/agent",
      "/models",
      "/model",
      "/skills",
      "/tools",
      "/new",
      "/sessions",
      "/resume",
      "/status",
      "/compact",
      "/export",
      "/auth",
      "/voice",
      "/init",
      "/review",
      "/exit",
    ];
    for (const command of this.app.commands?.all() ?? []) commands.push(`/${command.name}`);
    for (const agent of this.app.agents.primaries()) commands.push(`/agent ${agent.name}`);
    this.input.completions = [...new Set(commands)].sort();
  }

  private wireBus(): void {
    this.app.bus.subscribe((event) => {
      switch (event.type) {
        case "part.delta":
          if (event.sessionID === this.session.id) this.renderer.push(event.delta);
          break;
        case "part.updated":
          if (event.sessionID === this.session.id && event.part.type === "tool") {
            const track = this.tools.get(event.part.callID);
            if (track) track.args = event.part.args;
            else this.tools.set(event.part.callID, { tool: event.part.tool, title: "", startedAt: Date.now(), args: event.part.args });
          }
          break;
        case "tool.started":
          if (event.sessionID === this.session.id) {
            this.renderer.flush();
            const existing = this.tools.get(event.callID);
            if (existing) existing.title = event.tool !== existing.tool ? event.tool : existing.title;
            else this.tools.set(event.callID, { tool: event.tool, title: "", startedAt: Date.now() });
            this.spinner.start(event.tool);
          }
          break;
        case "tool.finished": {
          if (event.sessionID !== this.session.id) break;
          this.spinner.stop();
          const track = this.tools.get(event.callID);
          const ms = track ? Date.now() - track.startedAt : undefined;
          const title = track?.title || describeArgs(track?.tool ?? event.tool, track?.args);
          process.stdout.write(toolFinishLine(event.tool, title, event.status === "completed", ms) + "\n");
          // Diff preview for edits.
          if (event.tool === "edit" && track?.args && typeof track.args === "object") {
            const args = track.args as { oldString?: string; newString?: string };
            if (args.oldString !== undefined) process.stdout.write(renderDiffPreview(args.oldString, args.newString) + "\n");
          }
          this.tools.delete(event.callID);
          if (this.busy) this.spinner.start("thinking");
          break;
        }
        case "session.created":
          if (event.session.parentID === this.session.id) {
            this.spinner.stop();
            process.stdout.write(`${magenta("◈")} ${bold(event.session.agent)} ${dim(`⟩ ${event.session.title}`)}\n`);
            if (this.busy) this.spinner.start(`${event.session.agent} working`);
          }
          break;
        case "session.compacting":
          if (event.sessionID === this.session.id) {
            this.spinner.stop();
            process.stdout.write(`${yellow("◌")} ${dim("compacting context…")}\n`);
            this.spinner.start("summarizing history");
          }
          break;
        case "session.compacted":
          if (event.sessionID === this.session.id) {
            this.spinner.stop();
            process.stdout.write(`${green("◌")} ${dim("context compacted — older history summarized")}\n`);
          }
          break;
        case "permission.asked":
          this.askChain = this.askChain.then(() => this.promptAsk(event.request));
          break;
        default:
          break;
      }
    });
  }

  private async promptAsk(request: PermissionRequest): Promise<void> {
    // A cascade-reject or an "always" from a wave-mate may have already settled
    // this request while it sat in the ask queue — don't prompt for a ghost.
    if (!this.app.permissions.pendingRequests().some((r) => r.id === request.id)) return;
    this.spinner.stop();
    this.renderer.flush();
    const danger = request.metadata?.["dangerous"] === true;
    process.stdout.write(
      `\n${yellow("⚠")} ${bold(danger ? red("DANGEROUS ") : "")}${bold(request.permission)} → ${cyan(request.patterns.join(", "))}\n  ${dim(request.title)}\n`,
    );
    const answer = await this.input.question(`  ${bold("[y]")}es once  ${bold("[a]")}lways  ${bold("[n]")}o: `);
    const normalized = answer.trim().toLowerCase();
    if (normalized === "a" || normalized === "always") {
      this.app.permissions.reply(request.id, "always");
    } else if (normalized === "y" || normalized === "yes" || normalized === "") {
      this.app.permissions.reply(request.id, "once");
    } else {
      const feedback = await this.input.question(dim("  feedback for the model (enter to skip): "));
      this.app.permissions.reply(request.id, "reject", feedback.trim() || undefined);
    }
    if (this.busy) this.spinner.start("thinking");
  }

  async run(): Promise<void> {
    process.stdout.write(BANNER + "\n");
    const model = this.app.loaded.config.model ?? DEFAULT_MODEL;
    const voice = this.app.tts?.backend ? `  ${dim("voice:")} ${this.app.tts.backend}` : "";
    process.stdout.write(
      `${dim("model:")} ${model}  ${dim("agent:")} ${green(this.session.agent)}  ${dim("skills:")} ${this.app.skills.all().length}${voice}  ${dim("— /help for commands")}\n\n`,
    );

    let quit = false;
    while (!quit) {
      const raw = await this.input.readEntry(InputReader.promptString(this.session.agent));
      if (raw === INPUT_EOF) {
        process.stdout.write(dim("\nbye\n"));
        break;
      }
      const entry = raw.trim();
      if (!entry) continue;
      // A throwing command, shell escape, or turn must never take down the REPL.
      try {
        if (entry.startsWith("/")) {
          quit = await this.handleCommand(entry);
        } else if (entry.startsWith("!")) {
          await this.shellEscape(entry.slice(1).trim());
        } else {
          await this.send(this.expandAttachments(entry));
        }
      } catch (error) {
        this.spinner.stop();
        process.stdout.write(`${red("error:")} ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    this.input.close();
    this.app.tts?.stop();
    await this.app.dispose();
  }

  /** Inline `@path` mentions attach file contents (capped, contained, non-secret). */
  private expandAttachments(text: string): string {
    const mentions = [...text.matchAll(/(?<![\w`])@([\w./-]+)/g)].map((m) => m[1]!);
    let out = text;
    for (const mention of [...new Set(mentions)]) {
      const attachment = readAttachment(this.app.loaded.root, mention);
      if (!attachment) continue;
      out += `\n\n<attached-file path="${mention}">\n${attachment.content}\n</attached-file>`;
      process.stdout.write(`${dim(`⊕ attached ${mention}`)}\n`);
    }
    return out;
  }

  /** Permission-gated shell for `` !`cmd` `` inside custom commands. */
  private gateShell = async (command: string): Promise<boolean> => {
    const scan = scanBashCommand(command);
    try {
      await this.app.permissions.ask(this.session.id, {
        permission: "bash",
        patterns: scan.dangerous ? [`dangerous: ${command.slice(0, 80)}`] : scan.patterns,
        title: `command wants to run: ${command.slice(0, 100)}`,
        metadata: { command, dangerous: scan.dangerous },
      });
      return true;
    } catch {
      return false;
    }
  };

  /** `!cmd` — run a shell command directly; the transcript records it for the model. */
  private async shellEscape(command: string): Promise<void> {
    if (!command) return;
    const result = await spawnCapture(["bash", "-c", command], {
      cwd: this.app.loaded.root,
      timeoutMs: 120_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    process.stdout.write(dim(output ? output + "\n" : "(no output)\n"));
    if (result.exitCode !== 0) process.stdout.write(red(`exit ${result.exitCode}\n`));
    this.app.store.appendMessage({
      id: createId("msg"),
      sessionID: this.session.id,
      role: "user",
      agent: this.session.agent,
      parts: [
        {
          id: createId("prt"),
          type: "text",
          text: `I ran \`${command}\` myself:\n\`\`\`\n${output.slice(0, 8_000) || "(no output)"}\n\`\`\`${result.exitCode !== 0 ? `\n(exit code ${result.exitCode})` : ""}`,
          synthetic: true,
        },
      ],
      time: Date.now(),
    });
  }

  private async send(text: string): Promise<void> {
    this.busy = true;
    this.abort = new AbortController();
    const startedAt = Date.now();
    const interrupt = () => {
      const now = Date.now();
      if (now - this.lastSigint < 1500) process.exit(130);
      this.lastSigint = now;
      this.abort.abort();
      process.stdout.write(`\n${red("◼ interrupted")} ${dim("(ctrl+c again to quit)")}\n`);
    };
    this.input.onSigint(interrupt);
    process.stdout.write("\n");
    this.spinner.start("thinking");
    try {
      const final = await this.app.engine.prompt(this.session.id, text, this.abort.signal);
      // Voice: speak the final answer when enabled.
      if (this.app.tts?.enabled) {
        const spoken = final.parts
          .filter((p) => p.type === "text" && !p.synthetic)
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("\n");
        if (spoken) this.app.tts.speak(spoken);
      }
    } catch (error) {
      this.spinner.stop();
      if (!this.abort.signal.aborted) {
        process.stdout.write(`${red("error:")} ${error instanceof Error ? error.message : String(error)}\n`);
      }
    } finally {
      this.spinner.stop();
      this.renderer.flush();
      this.input.offSigint(interrupt);
      this.busy = false;
      this.printStatusLine(startedAt);
    }
  }

  /** Run a subtask command in an isolated child session; print its report. */
  private async runSubtask(agent: string, prompt: string, label: string): Promise<void> {
    this.busy = true;
    this.abort = new AbortController();
    const child = this.app.store.create({ agent, parentID: this.session.id, title: label });
    const interrupt = () => {
      this.abort.abort();
      process.stdout.write(`\n${red("◼ interrupted")}\n`);
    };
    this.input.onSigint(interrupt);
    process.stdout.write(`\n${magenta("◈")} ${bold(agent)} ${dim(`⟩ ${label}`)}\n`);
    this.spinner.start(`${agent} working`);
    try {
      const final = await this.app.engine.prompt(child.id, prompt, this.abort.signal);
      this.spinner.stop();
      this.renderer.flush();
      const report = final.parts
        .filter((p) => p.type === "text" && !p.synthetic)
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("\n")
        .trim();
      if (report) process.stdout.write(report + "\n");
    } catch (error) {
      this.spinner.stop();
      if (!this.abort.signal.aborted) {
        process.stdout.write(`${red("error:")} ${error instanceof Error ? error.message : String(error)}\n`);
      }
    } finally {
      this.spinner.stop();
      this.input.offSigint(interrupt);
      this.busy = false;
    }
  }

  private printStatusLine(startedAt: number): void {
    const session = this.app.store.get(this.session.id);
    const ctx = this.app.engine.contextInfo(this.session.id);
    const usage = session?.usage;
    process.stdout.write(
      "\n" +
        statusLine([
          usage ? dim(`${(usage.inputTokens + usage.cacheReadTokens).toLocaleString()}↑ ${usage.outputTokens.toLocaleString()}↓`) : undefined,
          ctx.tokens > 0 ? contextBar(ctx.pct) : undefined,
          session?.cost !== undefined && session.cost > 0 ? dim(formatCost(session.cost)) : undefined,
          dim(formatMs(Date.now() - startedAt)),
        ]) +
        "\n\n",
    );
  }

  /** Returns true when the REPL should exit. */
  private async handleCommand(entry: string): Promise<boolean> {
    const [command = "", ...rest] = entry.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    switch (command) {
      case "help":
        this.printHelp();
        return false;
      case "agents":
        for (const agent of this.app.agents.all().filter((a) => !a.hidden)) {
          const marker = agent.name === this.session.agent ? green("●") : dim("○");
          process.stdout.write(`${marker} ${bold(agent.name.padEnd(12))} ${dim(`[${agent.mode}]`)} ${agent.description}\n`);
        }
        return false;
      case "agent": {
        if (!arg) {
          process.stdout.write(`current: ${green(this.session.agent)}\n`);
          return false;
        }
        const agent = this.app.agents.get(arg);
        if (!agent || (agent.mode !== "primary" && agent.mode !== "all")) {
          process.stdout.write(`${red("✗")} no primary agent "${arg}" — see /agents\n`);
          return false;
        }
        this.session.agent = agent.name;
        this.app.store.update(this.session);
        process.stdout.write(`${green("✓")} agent → ${bold(agent.name)}\n`);
        return false;
      }
      case "models": {
        const models = this.app.catalog?.list();
        if (!models || models.length === 0) {
          process.stdout.write(dim("catalog unavailable\n"));
          return false;
        }
        const query = arg.toLowerCase();
        const current = this.app.loaded.config.model ?? DEFAULT_MODEL;
        let shown = 0;
        for (const model of models) {
          const ref = `${model.providerID}/${model.modelID}`;
          if (query && !ref.toLowerCase().includes(query)) continue;
          if (++shown > 30) {
            process.stdout.write(dim(`… narrow with /models <filter>\n`));
            break;
          }
          const marker = ref === current ? green("●") : dim("○");
          const ctx = model.contextLimit >= 1_000_000 ? `${model.contextLimit / 1_000_000}M` : `${Math.round(model.contextLimit / 1000)}k`;
          const price = model.cost.input > 0 ? `$${model.cost.input}/${model.cost.output}` : "free/local";
          process.stdout.write(`${marker} ${bold(ref.padEnd(44))} ${dim(`${ctx} ctx · ${price}`)}\n`);
        }
        if (shown === 0) process.stdout.write(dim("no models match\n"));
        return false;
      }
      case "model": {
        if (!arg) {
          process.stdout.write(`current: ${this.app.loaded.config.model ?? DEFAULT_MODEL}\n`);
          return false;
        }
        this.app.loaded.config.model = arg;
        process.stdout.write(`${green("✓")} model → ${bold(arg)} ${dim("(this session)")}\n`);
        return false;
      }
      case "auth": {
        await this.handleAuth(rest);
        return false;
      }
      case "voice": {
        if (!this.app.tts) {
          process.stdout.write(dim("voice unavailable\n"));
          return false;
        }
        if (arg === "off") this.app.tts.enabled = false;
        else if (arg === "on" || arg === "") this.app.tts.enabled = this.app.tts.backend !== null;
        if (arg === "stop") this.app.tts.stop();
        process.stdout.write(`${cyan("◆")} voice: ${this.app.tts.status()}\n`);
        return false;
      }
      case "skills": {
        const skills = this.app.skills.all();
        if (skills.length === 0) process.stdout.write(dim("no skills discovered\n"));
        for (const skill of skills) process.stdout.write(`${yellow("◆")} ${bold(skill.name)} — ${dim(skill.description.slice(0, 90))}\n`);
        return false;
      }
      case "tools":
        for (const tool of this.app.engine.tools.all()) {
          process.stdout.write(`${cyan("⚒")} ${bold(tool.id.padEnd(10))} ${dim(tool.description.slice(0, 90))}\n`);
        }
        return false;
      case "status": {
        const ctx = this.app.engine.contextInfo(this.session.id);
        const session = this.app.store.get(this.session.id);
        const rows: [string, string][] = [
          ["session", this.session.id],
          ["agent", this.session.agent],
          ["model", this.app.loaded.config.model ?? DEFAULT_MODEL],
          ["context", ctx.tokens > 0 ? `${ctx.tokens.toLocaleString()} / ${ctx.usable.toLocaleString()} tokens (${ctx.pct}%)` : "fresh"],
          ["cost", formatCost(session?.cost ?? 0)],
          ["skills", String(this.app.skills.all().length)],
          ["plugins", this.app.plugins.loadedNames.join(", ") || "none"],
          ["voice", this.app.tts?.status() ?? "unavailable"],
        ];
        for (const [key, value] of rows) process.stdout.write(`${dim(key.padStart(8))}  ${value}\n`);
        return false;
      }
      case "compact": {
        this.spinner.start("compacting");
        const compactAbort = new AbortController();
        const onCancel = () => compactAbort.abort();
        this.input.onSigint(onCancel);
        const result = await this.app.engine.compact(this.session.id, { auto: false, abort: compactAbort.signal });
        this.input.offSigint(onCancel);
        this.spinner.stop();
        const msg =
          result.status === "compacted"
            ? `${green("✓")} compacted — older history summarized`
            : result.status === "nothing"
              ? `${dim("○")} nothing to compact (history already small)`
              : `${red("✗")} compaction failed: ${result.error ?? "unknown"}`;
        process.stdout.write(msg + "\n");
        return false;
      }
      case "export": {
        const name = arg || `coven-${this.session.id.slice(-8)}.md`;
        const path = isAbsolute(name)
          ? name
          : name.startsWith("~/")
            ? join(homedir(), name.slice(2))
            : join(process.cwd(), name);
        writeFileSync(path, this.exportTranscript());
        process.stdout.write(`${green("✓")} exported → ${path}\n`);
        return false;
      }
      case "new":
      case "clear":
        this.session = this.app.store.create({ agent: this.session.agent });
        process.stdout.write(`${green("✓")} new session ${dim(this.session.id)}\n`);
        return false;
      case "sessions": {
        const sessions = this.app.store.list().slice(0, 15);
        sessions.forEach((session, index) => {
          const marker = session.id === this.session.id ? green("●") : dim("○");
          process.stdout.write(`${marker} ${dim(String(index + 1).padStart(2))} ${session.title.slice(0, 60)} ${dim(session.id)}\n`);
        });
        process.stdout.write(dim("switch with /resume <n>\n"));
        return false;
      }
      case "resume": {
        const index = Number(arg) - 1;
        const target = this.app.store.list()[index];
        if (!target) {
          process.stdout.write(`${red("✗")} no session #${arg} — see /sessions\n`);
          return false;
        }
        this.session = target;
        process.stdout.write(`${green("✓")} resumed ${bold(target.title.slice(0, 50))}\n`);
        return false;
      }
      case "exit":
      case "quit":
        return true;
      default: {
        // Custom / builtin template commands (init, review, user-defined).
        const def = this.app.commands?.get(command);
        if (def) {
          const expanded = await this.app.commands!.expand(def, arg, {
            root: this.app.loaded.root,
            gateShell: this.gateShell,
          });
          const boundAgent = def.agent && this.app.agents.get(def.agent) ? def.agent : undefined;
          if (def.subtask && boundAgent) {
            // Run in an isolated child session so it doesn't flood main context.
            await this.runSubtask(boundAgent, expanded, `/${command}`);
          } else if (boundAgent) {
            const previous = this.session.agent;
            this.session.agent = boundAgent;
            try {
              await this.send(expanded);
            } finally {
              this.session.agent = previous;
            }
          } else {
            await this.send(expanded);
          }
          return false;
        }
        process.stdout.write(`${red("✗")} unknown command /${command} — try /help\n`);
        return false;
      }
    }
  }

  private async handleAuth(rest: string[]): Promise<void> {
    if (!this.app.auth) {
      process.stdout.write(dim("auth unavailable\n"));
      return;
    }
    const [sub = "list", provider] = rest;
    if (sub === "list") {
      const entries = this.app.auth.entries();
      if (entries.length === 0) process.stdout.write(dim("no credentials — /auth login <provider>\n"));
      for (const entry of entries) {
        process.stdout.write(`${green("●")} ${bold(entry.provider.padEnd(14))} ${dim(`${entry.masked} (${entry.source})`)}\n`);
      }
      return;
    }
    if (sub === "login") {
      const target = provider ?? (await this.input.question("provider (anthropic/openai/groq/openrouter): ")).trim();
      if (!target) return;
      const key = (await this.input.question(`API key for ${target}: `)).trim();
      if (!key) return;
      this.app.auth.set(target, key);
      // Drop any cached adapter so the new key takes effect this session.
      this.app.providers.invalidate(target.toLowerCase().replace(/\/$/, ""));
      process.stdout.write(`${green("✓")} stored credential for ${bold(target)} ${dim("(~/.local/share/coven/auth.json, 0600)")}\n`);
      return;
    }
    if (sub === "logout" && provider) {
      const removed = this.app.auth.remove(provider);
      process.stdout.write(removed ? `${green("✓")} removed ${provider}\n` : `${red("✗")} no stored credential for ${provider}\n`);
      return;
    }
    process.stdout.write(dim("usage: /auth [list|login <provider>|logout <provider>]\n"));
  }

  private exportTranscript(): string {
    const lines: string[] = [`# Coven session — ${this.session.title}\n`];
    for (const message of this.app.store.messagesOf(this.session.id)) {
      const who = message.role === "user" ? "**You**" : `**Coven (${message.agent})**`;
      lines.push(`## ${who}\n`);
      for (const part of message.parts) {
        if (part.type === "text") lines.push(part.text + "\n");
        else if (part.type === "tool") lines.push(`> ⚒ \`${part.tool}\` ${part.title ?? ""} — ${part.status}\n`);
      }
    }
    return lines.join("\n");
  }

  private printHelp(): void {
    const rows: [string, string][] = [
      ["/agents · /agent <name>", "list agents / switch primary agent"],
      ["/models [filter] · /model <ref>", "browse catalog / set model"],
      ["/auth login <provider>", "store an API key (BYOK)"],
      ["/skills · /tools", "list skills / tools"],
      ["/status", "session, context %, cost, voice"],
      ["/compact", "summarize older history to free context"],
      ["/voice [on|off|stop]", "toggle text-to-speech"],
      ["/init", "generate AGENTS.md for this repo"],
      ["/review [target]", "dispatch a code review"],
      ["/new · /sessions · /resume <n>", "session management"],
      ["/export [file]", "write transcript markdown"],
      ["!<cmd>", "run a shell command yourself"],
      ["@file", "attach a file to your prompt"],
      ["/exit", "quit"],
    ];
    for (const [cmd, desc] of rows) process.stdout.write(`  ${bold(cmd.padEnd(34))} ${dim(desc)}\n`);
  }
}

function describeArgs(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const value = record["filePath"] ?? record["command"] ?? record["pattern"] ?? record["url"] ?? record["name"] ?? record["description"] ?? "";
  return String(value);
}
