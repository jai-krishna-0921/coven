/**
 * Input handling: readline with persisted history, tab completion for
 * slash commands and agent names, and multi-line input (trailing "\" or an
 * unclosed ``` fence continues the entry on the next line).
 */
import * as readline from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { dim, gray, magenta } from "../util/ansi.ts";

const HISTORY_MAX = 1000;

/** Sentinel returned by readEntry when the input stream closes (Ctrl+D / idle Ctrl+C). */
export const INPUT_EOF = "\x00EOF";

export class InputReader {
  private rl: readline.Interface;
  private historyPath: string;
  private closed = false;
  /** Count of active turn-level SIGINT handlers — idle when zero. */
  private turnHandlers = 0;
  /** Names offered to the tab completer, refreshed by the TUI. */
  completions: string[] = [];

  constructor(dataDir?: string) {
    this.historyPath = join(dataDir ?? join(homedir(), ".local", "share", "coven"), "history");
    const history = this.loadHistory();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      // Forcing terminal:true on a non-TTY (a pipe) breaks line editing; detect it.
      terminal: Boolean(process.stdin.isTTY),
      history,
      historySize: HISTORY_MAX,
      completer: (line: string): [string[], string] => {
        if (!line.startsWith("/") && !line.startsWith("@")) return [[], line];
        const matches = this.completions.filter((c) => c.startsWith(line));
        return [matches.length > 0 ? matches : [], line];
      },
    });
    // Ctrl+D (EOF) or an idle Ctrl+C closes cleanly instead of killing the
    // process — history is saved and the run loop gets to dispose().
    this.rl.on("close", () => {
      this.closed = true;
      this.saveHistory();
    });
    this.rl.on("SIGINT", () => {
      // Only act at idle; during a turn the TUI's own handler manages interrupts.
      if (this.turnHandlers === 0) this.rl.close();
    });
  }

  private loadHistory(): string[] {
    try {
      if (existsSync(this.historyPath)) {
        // readline expects newest-first.
        return readFileSync(this.historyPath, "utf8").split("\n").filter(Boolean).reverse().slice(0, HISTORY_MAX);
      }
    } catch {
      // Unreadable history is not fatal.
    }
    return [];
  }

  saveHistory(): void {
    try {
      const history = (this.rl as unknown as { history?: string[] }).history ?? [];
      mkdirSync(dirname(this.historyPath), { recursive: true });
      writeFileSync(this.historyPath, [...history].reverse().join("\n") + "\n");
    } catch {
      // Best effort.
    }
  }

  question(prompt: string): Promise<string> {
    if (this.closed) return Promise.resolve(INPUT_EOF);
    return new Promise((resolve) => {
      // If the stream closes while awaiting, resolve EOF rather than hang forever.
      const onClose = () => resolve(INPUT_EOF);
      this.rl.once("close", onClose);
      this.rl.question(prompt, (answer) => {
        this.rl.off("close", onClose);
        resolve(answer);
      });
    });
  }

  /**
   * Read one logical entry: lines ending in "\" continue; an entry with an
   * unclosed ``` fence keeps reading until the fence closes. Returns INPUT_EOF
   * when the stream closes.
   */
  async readEntry(prompt: string): Promise<string> {
    let entry = await this.question(prompt);
    if (entry === INPUT_EOF) return INPUT_EOF;
    const contPrompt = `${gray("…")} `;
    while (needsContinuation(entry)) {
      const next = await this.question(contPrompt);
      if (next === INPUT_EOF) break;
      entry = entry.endsWith("\\") ? `${entry.slice(0, -1)}\n${next}` : `${entry}\n${next}`;
    }
    return entry;
  }

  onSigint(handler: () => void): void {
    this.turnHandlers++;
    this.rl.on("SIGINT", handler);
  }

  offSigint(handler: () => void): void {
    this.turnHandlers = Math.max(0, this.turnHandlers - 1);
    this.rl.off("SIGINT", handler);
  }

  close(): void {
    this.saveHistory();
    this.rl.close();
  }

  static promptString(agent: string): string {
    return `${magenta("coven")}${dim(`(${agent})`)} ${gray("❯")} `;
  }
}

export function needsContinuation(entry: string): boolean {
  if (entry.endsWith("\\")) return true;
  const fences = (entry.match(/```/g) ?? []).length;
  return fences % 2 === 1;
}
