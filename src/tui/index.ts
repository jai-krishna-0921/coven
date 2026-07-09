/**
 * The Coven terminal interface — a streaming REPL.
 * Renders bus events live (text deltas, tool activity), prompts for
 * permission asks, and handles slash commands.
 */
import * as readline from "node:readline";
import type { App } from "../app.ts";
import type { SessionInfo } from "../session/types.ts";
import type { PermissionRequest } from "../permission/types.ts";
import { bold, cyan, dim, gray, green, magenta, red, yellow } from "../util/ansi.ts";
import { DEFAULT_MODEL } from "../config/schema.ts";
import { Spinner, StreamRenderer } from "./render.ts";

const BANNER = `
   ${magenta("▄████▄   ▒█████   ██▒   █▓▓█████  ███▄    █")}
   ${magenta("▒██▀ ▀█  ▒██▒  ██▒▓██░   █▒▓█   ▀  ██ ▀█   █")}
   ${magenta("▒▓█    ▄ ▒██░  ██▒ ▓██  █▒░▒███   ▓██  ▀█ ██▒")}
   ${magenta("▒▓▓▄ ▄██▒▒██   ██░  ▒██ █░░▒▓█  ▄ ▓██▒  ▐▌██▒")}
   ${magenta("▒ ▓███▀ ░░ ████▓▒░   ▒▀█░  ░▒████▒▒██░   ▓██░")}
   ${dim("a coven of coding agents in your terminal")}
`;

export class Tui {
  private rl: readline.Interface;
  private session: SessionInfo;
  private spinner = new Spinner();
  private renderer: StreamRenderer;
  private abort = new AbortController();
  private busy = false;

  constructor(private app: App) {
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    this.renderer = new StreamRenderer((text) => {
      this.spinner.stop();
      process.stdout.write(text);
    });
    const agentName = app.loaded.config.default_agent ?? "builder";
    this.session = app.store.create({ agent: app.agents.get(agentName) ? agentName : "builder" });
    this.wireBus();
  }

  private wireBus(): void {
    this.app.bus.subscribe((event) => {
      switch (event.type) {
        case "part.delta":
          if (event.sessionID === this.session.id) this.renderer.push(event.delta);
          break;
        case "tool.started":
          if (event.sessionID === this.session.id) {
            this.renderer.flush();
            this.spinner.start(`${event.tool}`);
          }
          break;
        case "tool.finished": {
          if (event.sessionID === this.session.id) {
            this.spinner.stop();
            const mark = event.status === "completed" ? green("✓") : red("✗");
            process.stdout.write(`${mark} ${dim(event.tool)}\n`);
          }
          break;
        }
        case "session.created":
          if (event.session.parentID === this.session.id) {
            this.spinner.stop();
            process.stdout.write(`${magenta("◈")} ${dim(`subagent session: ${event.session.agent} — ${event.session.title}`)}\n`);
          }
          break;
        case "permission.asked":
          void this.handleAsk(event.request);
          break;
        default:
          break;
      }
    });
  }

  private async handleAsk(request: PermissionRequest): Promise<void> {
    this.spinner.stop();
    this.renderer.flush();
    process.stdout.write(
      `\n${yellow("⚠ permission")} ${bold(request.permission)} → ${cyan(request.patterns.join(", "))}\n  ${request.title}\n`,
    );
    const answer = await this.question(`  ${bold("[y]")}es once  ${bold("[a]")}lways  ${bold("[n]")}o: `);
    const normalized = answer.trim().toLowerCase();
    if (normalized === "a" || normalized === "always") {
      this.app.permissions.reply(request.id, "always");
    } else if (normalized === "y" || normalized === "yes" || normalized === "") {
      this.app.permissions.reply(request.id, "once");
    } else {
      const feedback = await this.question(dim("  feedback for the model (enter to skip): "));
      this.app.permissions.reply(request.id, "reject", feedback.trim() || undefined);
    }
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => this.rl.question(prompt, resolve));
  }

  async run(): Promise<void> {
    process.stdout.write(BANNER + "\n");
    const model = this.app.loaded.config.model ?? DEFAULT_MODEL;
    process.stdout.write(
      `${dim("model:")} ${model}  ${dim("agent:")} ${green(this.session.agent)}  ${dim("skills:")} ${this.app.skills.all().length}  ${dim("type /help for commands")}\n\n`,
    );

    while (true) {
      const input = (await this.question(`${magenta("coven")} ${gray("❯")} `)).trim();
      if (!input) continue;
      if (input.startsWith("/")) {
        if (await this.handleCommand(input)) break;
        continue;
      }
      await this.send(input);
    }
    this.rl.close();
    await this.app.dispose();
  }

  private async send(text: string): Promise<void> {
    this.busy = true;
    this.abort = new AbortController();
    const interrupt = () => {
      this.abort.abort();
      process.stdout.write(`\n${red("interrupted")}\n`);
    };
    this.rl.on("SIGINT", interrupt);
    process.stdout.write("\n");
    this.spinner.start("thinking");
    try {
      await this.app.engine.prompt(this.session.id, text, this.abort.signal);
    } catch (error) {
      this.spinner.stop();
      if (!this.abort.signal.aborted) {
        process.stdout.write(`${red("error:")} ${error instanceof Error ? error.message : String(error)}\n`);
      }
    } finally {
      this.spinner.stop();
      this.renderer.flush();
      this.rl.off("SIGINT", interrupt);
      this.busy = false;
      const usage = this.app.store.get(this.session.id)?.usage;
      if (usage) {
        process.stdout.write(
          dim(`\n─ tokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out ─\n\n`),
        );
      }
    }
  }

  /** Returns true when the REPL should exit. */
  private async handleCommand(input: string): Promise<boolean> {
    const [command = "", ...rest] = input.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    switch (command) {
      case "help":
        process.stdout.write(
          [
            `${bold("/agent <name>")}   switch primary agent`,
            `${bold("/agents")}         list agents`,
            `${bold("/skills")}         list skills`,
            `${bold("/tools")}          list tools`,
            `${bold("/new")}            start a fresh session`,
            `${bold("/sessions")}       list sessions`,
            `${bold("/exit")}           quit`,
          ].join("\n") + "\n",
        );
        return false;
      case "agents": {
        for (const agent of this.app.agents.all().filter((a) => !a.hidden)) {
          const marker = agent.name === this.session.agent ? green("●") : dim("○");
          process.stdout.write(`${marker} ${bold(agent.name.padEnd(12))} ${dim(`[${agent.mode}]`)} ${agent.description}\n`);
        }
        return false;
      }
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
      case "skills": {
        const skills = this.app.skills.all();
        if (skills.length === 0) process.stdout.write(dim("no skills discovered\n"));
        for (const skill of skills) process.stdout.write(`${yellow("◆")} ${bold(skill.name)} — ${dim(skill.description.slice(0, 90))}\n`);
        return false;
      }
      case "tools": {
        for (const tool of this.app.engine.tools.all()) {
          process.stdout.write(`${cyan("⚒")} ${bold(tool.id.padEnd(10))} ${dim(tool.description.slice(0, 90))}\n`);
        }
        return false;
      }
      case "new":
        this.session = this.app.store.create({ agent: this.session.agent });
        process.stdout.write(`${green("✓")} new session ${dim(this.session.id)}\n`);
        return false;
      case "sessions": {
        for (const session of this.app.store.list().slice(0, 15)) {
          const marker = session.id === this.session.id ? green("●") : dim("○");
          process.stdout.write(`${marker} ${dim(session.id)} ${session.title.slice(0, 60)}\n`);
        }
        return false;
      }
      case "exit":
      case "quit":
        return true;
      default:
        process.stdout.write(`${red("✗")} unknown command /${command} — try /help\n`);
        return false;
    }
  }
}
