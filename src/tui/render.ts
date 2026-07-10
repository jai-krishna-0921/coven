/**
 * Terminal rendering: incremental markdown, tool activity lines, diffs,
 * status line, spinner. Pure output helpers — no input handling here.
 */
import { bold, cyan, dim, gray, green, italic, magenta, red, yellow } from "../util/ansi.ts";

const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|interface|type|async|await|new|throw|try|catch|def|fn|pub|impl|struct|enum|match)\b/g;

export function renderMarkdownLine(line: string, state: { inFence: boolean }): string {
  if (line.trimStart().startsWith("```")) {
    state.inFence = !state.inFence;
    return gray(line);
  }
  if (state.inFence) {
    // Light keyword tinting inside code fences.
    return dim(line.replace(KEYWORDS, (kw) => `[22m${cyan(kw)}[2m`));
  }

  let out = line;
  const header = /^(#{1,4})\s+(.*)$/.exec(out);
  if (header) return bold(cyan(header[2] ?? ""));
  out = out.replace(/^(\s*)[-*]\s+/, (_m, indent: string) => `${indent}${yellow("•")} `);
  out = out.replace(/^(\s*\d+)\.\s+/, (_m, num: string) => `${yellow(num + ".")} `);
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => green(code));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, text: string) => bold(text));
  out = out.replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, (_m, text: string) => italic(text));
  return out;
}

/** Incremental renderer: feed deltas, it renders completed lines with markdown. */
export class StreamRenderer {
  private buffer = "";
  private state = { inFence: false };

  constructor(private write: (text: string) => void) {}

  push(delta: string): void {
    this.buffer += delta;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.write(renderMarkdownLine(line, this.state) + "\n");
      newline = this.buffer.indexOf("\n");
    }
  }

  flush(): void {
    if (this.buffer) {
      this.write(renderMarkdownLine(this.buffer, this.state) + "\n");
      this.buffer = "";
    }
    this.state.inFence = false;
  }
}

const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read: "⊙",
  write: "✎",
  edit: "✎",
  grep: "⌕",
  glob: "⌕",
  ls: "⊟",
  webfetch: "⇩",
  task: "◈",
  skill: "◆",
  todo: "☰",
};

export function toolStartLine(tool: string, title: string): string {
  const icon = TOOL_ICONS[tool] ?? "⚒";
  return `${cyan(icon)} ${bold(tool)} ${dim(truncateMiddle(title, 90))}`;
}

export function toolFinishLine(tool: string, title: string, ok: boolean, ms?: number): string {
  const mark = ok ? green("✓") : red("✗");
  const duration = ms !== undefined && ms > 150 ? dim(` ${formatMs(ms)}`) : "";
  return `${mark} ${bold(tool)} ${dim(truncateMiddle(title, 80))}${duration}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

function truncateMiddle(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 20)}…${flat.slice(-16)}`;
}

/** ± diff preview for edit/write tool calls, capped per side. */
export function renderDiffPreview(oldString: string | undefined, newString: string | undefined, cap = 6): string {
  const lines: string[] = [];
  const removed = (oldString ?? "").split("\n").slice(0, cap);
  const added = (newString ?? "").split("\n").slice(0, cap);
  for (const line of removed) lines.push(red(`  - ${line.slice(0, 100)}`));
  if ((oldString ?? "").split("\n").length > cap) lines.push(dim("  - …"));
  for (const line of added) lines.push(green(`  + ${line.slice(0, 100)}`));
  if ((newString ?? "").split("\n").length > cap) lines.push(dim("  + …"));
  return lines.join("\n");
}

export function statusLine(fields: (string | undefined)[]): string {
  return dim("─ ") + fields.filter(Boolean).join(dim(" · ")) + dim(" ─");
}

export function formatCost(cost: number): string {
  if (cost >= 0.995) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `${Math.round(cost * 100)}¢`;
  return cost > 0 ? "<1¢" : "$0";
}

export function contextBar(pct: number): string {
  const color = pct >= 85 ? red : pct >= 60 ? yellow : green;
  return color(`ctx ${pct}%`);
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private text = "";
  private startedAt = 0;

  start(text: string): void {
    this.text = text;
    if (this.timer || !process.stdout.isTTY) return;
    this.startedAt = Date.now();
    this.timer = setInterval(() => {
      const elapsed = Date.now() - this.startedAt;
      const suffix = elapsed > 3000 ? dim(` ${formatMs(elapsed)}`) : "";
      process.stdout.write(`\r[2K${magenta(FRAMES[this.frame % FRAMES.length]!)} ${dim(this.text.slice(0, 90))}${suffix}`);
      this.frame++;
    }, 80);
  }

  update(text: string): void {
    this.text = text;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      process.stdout.write(`\r[2K`);
    }
  }
}

export const BANNER = `
  ${magenta("░█▀▀░█▀█░█░█░█▀▀░█▀█")}
  ${magenta("░█░░░█░█░▀▄▀░█▀▀░█░█")}
  ${magenta("░▀▀▀░▀▀▀░░▀░░▀▀▀░▀░▀")}
  ${dim("a coven of coding agents in your terminal")}
`;
