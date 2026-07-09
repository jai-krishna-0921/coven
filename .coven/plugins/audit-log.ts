/**
 * Example plugin: audit log.
 * Appends every bash command and file edit to .coven/audit.jsonl — a tamper-
 * evident record of what the agents actually did. Demonstrates the plugin API:
 * default-export a function (PluginInput) => Hooks.
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";

interface AuditEntry {
  time: string;
  sessionID: string;
  tool: string;
  detail: string;
}

export default function auditLogPlugin(input: { root: string }) {
  const logPath = join(input.root, ".coven", "audit.jsonl");

  function record(entry: AuditEntry): void {
    try {
      appendFileSync(logPath, JSON.stringify(entry) + "\n");
    } catch {
      // Auditing must never break the session.
    }
  }

  return {
    "tool.execute.after": async (
      meta: { tool: string; sessionID: string; callID: string; args: unknown },
      _result: { title: string; output: string },
    ) => {
      if (meta.tool !== "bash" && meta.tool !== "edit" && meta.tool !== "write") return;
      const args = meta.args as Record<string, unknown>;
      record({
        time: new Date().toISOString(),
        sessionID: meta.sessionID,
        tool: meta.tool,
        detail: String(args["command"] ?? args["filePath"] ?? ""),
      });
    },
  };
}
