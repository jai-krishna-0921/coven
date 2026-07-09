export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export interface SessionInfo {
  id: string;
  title: string;
  agent: string;
  /** Set when this session is a subagent spawned by the task tool. */
  parentID?: string;
  created: number;
  updated: number;
  usage: Usage;
}

export type ToolStatus = "pending" | "running" | "completed" | "error";

export type Part =
  | { id: string; type: "text"; text: string; synthetic?: boolean }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "tool";
      callID: string;
      tool: string;
      args: unknown;
      status: ToolStatus;
      title?: string;
      output?: string;
      error?: string;
    };

export type FinishReason = "stop" | "tool-calls" | "length" | "aborted" | "error";

export interface Message {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  parts: Part[];
  /** Agent that produced this message (assistant) or it was addressed to (user). */
  agent: string;
  model?: string;
  usage?: Usage;
  finish?: FinishReason;
  time: number;
}
