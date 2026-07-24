/**
 * Transcript exporter — pure formatter split out of app.tsx so it can be
 * unit-tested and so DialogExportOptions can drive it with the user's chosen
 * knobs. The export always includes user + assistant text; reasoning, tool
 * details, and per-message metadata are opt-in.
 */
import type { Message, SessionInfo } from "../session/types.ts";

export interface ExportOptions {
  filename: string;
  includeReasoning: boolean;
  includeToolDetails: boolean;
  includeMetadata: boolean;
  openInEditor: boolean;
}

export function defaultExportOptions(sessionID: string): ExportOptions {
  return {
    filename: `coven-${sessionID.slice(-8)}.md`,
    includeReasoning: false,
    includeToolDetails: false,
    includeMetadata: false,
    openInEditor: false,
  };
}

/**
 * Strip path separators and any leading dots so a user-provided filename can
 * never escape the workspace root. Empty input falls back to the default.
 */
export function sanitizeFilename(input: string, sessionID: string): string {
  const trimmed = input.trim();
  if (!trimmed) return `coven-${sessionID.slice(-8)}.md`;
  const stripped = trimmed
    .replace(/[/\\]+/g, "-")   // slashes → hyphen
    .replace(/^\.+/, "")        // leading dots (blocks ".env", "../etc")
    .replace(/[\x00-\x1f]/g, "") // control chars
    .slice(0, 200);
  return stripped || `coven-${sessionID.slice(-8)}.md`;
}

export function renderTranscript(messages: readonly Message[], session: SessionInfo, options: ExportOptions): string {
  const lines: string[] = [`# Coven session — ${session.title}\n`];
  for (const message of messages) {
    lines.push(`## ${message.role === "user" ? "**You**" : `**Coven (${message.agent})**`}\n`);
    for (const part of message.parts) {
      if (part.type === "text") {
        lines.push(part.text + "\n");
        continue;
      }
      if (part.type === "reasoning") {
        if (options.includeReasoning) lines.push(`<details><summary>thinking</summary>\n\n${part.text}\n\n</details>\n`);
        continue;
      }
      if (part.type === "tool") {
        if (options.includeToolDetails) {
          lines.push(`> \`${part.tool}\` ${part.title ?? ""} — ${part.status}`);
          if (part.args !== undefined) lines.push("```json\n" + JSON.stringify(part.args, null, 2) + "\n```");
          if (part.output) lines.push("```\n" + part.output + "\n```");
          lines.push("");
        } else {
          lines.push(`> \`${part.tool}\` ${part.title ?? ""} — ${part.status}\n`);
        }
        continue;
      }
    }
    if (options.includeMetadata && message.role === "assistant" && (message.model || message.usage)) {
      const bits: string[] = [];
      if (message.model) bits.push(`model=${message.model}`);
      if (message.usage) {
        const u = message.usage;
        bits.push(`tokens=${u.inputTokens}/${u.outputTokens}`);
        if (u.cacheReadTokens) bits.push(`cache-r=${u.cacheReadTokens}`);
        if (u.cacheWriteTokens) bits.push(`cache-w=${u.cacheWriteTokens}`);
      }
      if (message.finish) bits.push(`finish=${message.finish}`);
      lines.push(`<!-- ${bits.join(" ")} -->\n`);
    }
  }
  return lines.join("\n");
}
