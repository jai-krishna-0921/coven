/**
 * Language Server Protocol (LSP) types — the subset Coven needs for diagnostics
 * plus hover / definition / references. JSON-RPC 2.0 over Content-Length framing.
 */

export type JsonRpcId = number | string;

export interface LspRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}
export interface LspNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}
export interface LspResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
export type LspMessage = LspRequest | LspNotification | LspResponse;

export interface Position {
  line: number; // 0-based
  character: number; // 0-based
}
export interface Range {
  start: Position;
  end: Position;
}
export interface Location {
  uri: string;
  range: Range;
}

/** severity: 1 Error · 2 Warning · 3 Information · 4 Hint */
export interface Diagnostic {
  range: Range;
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
}

export const SEVERITY_LABEL: Record<number, string> = { 1: "error", 2: "warning", 3: "info", 4: "hint" };

export interface LspServerStatus {
  language: string;
  command: string;
  state: "starting" | "ready" | "error";
  error?: string;
  openFiles: number;
  diagnostics: number;
}
