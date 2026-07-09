/**
 * Lightweight terminal markdown rendering — enough to make model output
 * pleasant without a rendering engine: headers, bold/italic/inline code,
 * fenced code blocks, list bullets.
 */
import { bold, cyan, dim, gray, green, italic, yellow } from "../util/ansi.ts";

export function renderMarkdownLine(line: string, state: { inFence: boolean }): string {
  if (line.trimStart().startsWith("```")) {
    state.inFence = !state.inFence;
    return gray(line);
  }
  if (state.inFence) return dim(line);

  let out = line;
  // Headers
  const header = /^(#{1,4})\s+(.*)$/.exec(out);
  if (header) return bold(cyan(header[2] ?? ""));
  // Bullets
  out = out.replace(/^(\s*)[-*]\s+/, (_m, indent: string) => `${indent}${yellow("•")} `);
  // Inline code / bold / italic
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

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private text = "";

  start(text: string): void {
    this.text = text;
    if (this.timer) return;
    if (!process.stdout.isTTY) return;
    this.timer = setInterval(() => {
      process.stdout.write(`\r[2K${cyan(FRAMES[this.frame % FRAMES.length]!)} ${dim(this.text.slice(0, 100))}`);
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
      process.stdout.write(`\r[2K`);
    }
  }
}
