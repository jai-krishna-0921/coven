export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionRule {
  /** Permission kind: "bash", "edit", "read", "task", "skill", "webfetch", "doom_loop", … */
  permission: string;
  /** Wildcard pattern matched against the request pattern (command, path, agent name, …). */
  pattern: string;
  action: PermissionAction;
}

export type Ruleset = PermissionRule[];

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  /** Human-readable one-liner shown in the ask prompt. */
  title: string;
  metadata?: Record<string, unknown>;
}

export type PermissionReply = "once" | "always" | "reject";

export interface AskInput {
  permission: string;
  patterns: string[];
  title: string;
  metadata?: Record<string, unknown>;
}
