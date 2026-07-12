/**
 * Non-TTY fallback REPL (§14). When stdout/stdin are not both TTYs — piped input,
 * CI, a dumb terminal — Ink cannot mount an alternate-screen app, so `runTui`
 * routes here instead. It is a line-oriented loop over `node:readline`: it
 * subscribes to the bus (streaming `part.delta` to output, printing `[tool]`
 * markers), handles `/`-commands, `!`-shell escapes and `@`-file attachments, and
 * on `permission.asked` prompts `[y]es/[a]lways/[n]o` on the SAME input. If stdin
 * has closed (fully piped), pending asks are auto-rejected with guidance rather
 * than hanging. No alt screen and no colors — plain text only. `runTui` owns the
 * TTY decision and `app.dispose()`; this function neither mounts Ink nor disposes.
 */
import { createInterface } from "node:readline";
import type { App } from "./../app.ts";
import type { Message, SessionInfo } from "../session/types.ts";
import { createId } from "../util/id.ts";
import { readAttachment } from "../util/path.ts";
import { scanBashCommand } from "../tool/bash-scan.ts";
import { spawnCapture } from "../util/proc.ts";

const SHELL_TIMEOUT_MS = 120_000;

const errMsg = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface FallbackIo {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export async function runFallbackRepl(app: App, io: FallbackIo = {}): Promise<void> {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  const rl = createInterface({ input, output, terminal: false });

  // Own the line stream via a queue so lines that arrive between reads are never
  // dropped, and a single reader (main loop OR a permission prompt) is served at
  // a time — the two never overlap because the main loop blocks during a turn.
  const lineQueue: string[] = [];
  let waiting: ((line: string | null) => void) | null = null;
  let ended = false;
  rl.on("line", (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      lineQueue.push(line);
    }
  });
  rl.on("close", () => {
    ended = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });

  const nextLine = (query: string): Promise<string | null> => {
    if (query) output.write(query);
    const buffered = lineQueue.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (ended) return Promise.resolve(null);
    return new Promise((resolve) => {
      waiting = resolve;
    });
  };

  const configured = app.loaded.config.default_agent ?? "builder";
  let session: SessionInfo = app.store.create({ agent: app.agents.get(configured) ? configured : "builder" });

  // Serialize permission asks — a parallel tool wave can overlap.
  let askChain: Promise<void> = Promise.resolve();

  const promptPermission = async (request: { id: string; sessionID: string; permission: string; patterns: string[]; title: string; metadata?: Record<string, unknown> }): Promise<void> => {
    // A cascade-reject or wave-mate "always" may have settled this while queued.
    if (!app.permissions.pendingRequests().some((r) => r.id === request.id)) return;
    const danger = request.metadata?.["dangerous"] === true;
    output.write(`\n${danger ? "DANGEROUS " : ""}${request.permission} -> ${request.patterns.join(", ")}\n  ${request.title}\n`);
    const answer = await nextLine("  [y]es once  [a]lways  [n]o: ");
    if (answer === null) {
      app.permissions.reply(request.id, "reject", "Non-interactive stdin closed: action not permitted (run interactively to approve).");
      return;
    }
    const normalized = answer.trim().toLowerCase();
    if (normalized === "a" || normalized === "always") {
      app.permissions.reply(request.id, "always");
    } else if (normalized === "y" || normalized === "yes" || normalized === "") {
      app.permissions.reply(request.id, "once");
    } else {
      const feedback = await nextLine("  feedback for the model (enter to skip): ");
      app.permissions.reply(request.id, "reject", (feedback ?? "").trim() || undefined);
    }
  };

  const unsubscribe = app.bus.subscribe((event) => {
    if (event.type === "part.delta" && event.sessionID === session.id) {
      output.write(event.delta);
    } else if (event.type === "tool.finished" && event.sessionID === session.id) {
      output.write(`\n[${event.tool}]\n`);
    } else if (event.type === "permission.asked" && event.request.sessionID === session.id) {
      const request = event.request;
      askChain = askChain.then(() => promptPermission(request));
    }
  });

  /** Permission-gated shell for `` !`cmd` `` expansion inside custom commands. */
  const gateShell = async (command: string): Promise<boolean> => {
    const scan = scanBashCommand(command);
    try {
      await app.permissions.ask(
        session.id,
        {
          permission: "bash",
          patterns: scan.dangerous ? [`dangerous: ${command.slice(0, 80)}`] : scan.patterns,
          title: `command wants to run: ${command.slice(0, 100)}`,
          metadata: { command, dangerous: scan.dangerous },
        },
        app.agents.get(session.agent)?.permission ?? [],
      );
      return true;
    } catch {
      return false;
    }
  };

  const send = async (text: string, override?: { agent?: string; model?: string }): Promise<void> => {
    const abort = new AbortController();
    output.write("\n");
    try {
      const final = await app.engine.prompt(session.id, text, abort.signal, override);
      output.write("\n");
      if (app.tts?.enabled) {
        const spoken = final.parts
          .filter((part) => part.type === "text" && !part.synthetic)
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n");
        if (spoken) app.tts.speak(spoken);
      }
    } catch (error) {
      output.write(`error: ${errMsg(error)}\n`);
    }
  };

  /** Inline `@path` mentions attach file contents (capped, contained, non-secret). */
  const expandAttachments = (text: string): string => {
    const mentions = [...text.matchAll(/(?<![\w`])@([\w./-]+)/g)].map((match) => match[1] ?? "");
    let out = text;
    for (const mention of [...new Set(mentions)]) {
      if (!mention) continue;
      const attachment = readAttachment(app.loaded.root, mention);
      if (!attachment) continue;
      out += `\n\n<attached-file path="${mention}">\n${attachment.content}\n</attached-file>`;
      output.write(`+ attached ${mention}\n`);
    }
    return out;
  };

  /** `!cmd` — run a shell command directly; record its output for the model. */
  const shellEscape = async (command: string): Promise<void> => {
    if (!command) return;
    const result = await spawnCapture(["bash", "-c", command], { cwd: app.loaded.root, timeoutMs: SHELL_TIMEOUT_MS });
    const captured = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    output.write(captured ? captured + "\n" : "(no output)\n");
    if (result.exitCode !== 0) output.write(`exit ${result.exitCode}\n`);
    const message: Message = {
      id: createId("msg"),
      sessionID: session.id,
      role: "user",
      agent: session.agent,
      parts: [
        {
          id: createId("prt"),
          type: "text",
          text: `I ran \`${command}\` myself:\n\`\`\`\n${captured.slice(0, 8_000) || "(no output)"}\n\`\`\`${
            result.exitCode !== 0 ? `\n(exit code ${result.exitCode})` : ""
          }`,
          synthetic: true,
        },
      ],
      time: Date.now(),
    };
    app.store.appendMessage(message);
  };

  /** Returns true when the REPL should exit. */
  const handleCommand = async (entry: string): Promise<boolean> => {
    const [command = "", ...rest] = entry.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    switch (command) {
      case "exit":
      case "quit":
        return true;
      case "help":
        output.write("commands: /new /exit  ·  !<cmd> shell  ·  @path attach\n");
        return false;
      case "new":
      case "clear":
        session = app.store.create({ agent: session.agent });
        output.write(`new session ${session.id}\n`);
        return false;
      default: {
        const def = app.commands?.get(command);
        if (def) {
          const expanded = await app.commands!.expand(def, arg, { root: app.loaded.root, gateShell });
          await send(expanded, { agent: def.agent, model: def.model });
          return false;
        }
        output.write(`unknown command /${command} — try /help\n`);
        return false;
      }
    }
  };

  output.write(`coven — fallback mode (no TTY). agent: ${session.agent}. /help for commands, /exit to quit.\n`);

  try {
    let quit = false;
    while (!quit) {
      const line = await nextLine(`\n${session.agent} > `);
      if (line === null) {
        output.write("\nbye\n");
        break;
      }
      const entry = line.trim();
      if (!entry) continue;
      try {
        if (entry.startsWith("/")) quit = await handleCommand(entry);
        else if (entry.startsWith("!")) await shellEscape(entry.slice(1).trim());
        else await send(expandAttachments(entry));
      } catch (error) {
        output.write(`error: ${errMsg(error)}\n`);
      }
    }
  } finally {
    unsubscribe();
    rl.close();
  }
}
