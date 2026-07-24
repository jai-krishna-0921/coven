/**
 * Model Context Protocol (MCP) types — the subset Coven's client needs.
 * Transport-agnostic JSON-RPC 2.0 plus the initialize / tools handshake.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const JSONRPC_VERSION = "2.0";

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** A tool advertised by an MCP server (tools/list). `inputSchema` is JSON Schema. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** One content block of a tools/call result. */
export interface McpContent {
  type: string; // "text" | "image" | "resource" | …
  text?: string;
  [key: string]: unknown;
}

export interface McpToolCallResult {
  content: McpContent[];
  isError?: boolean;
}

/** A running server's live status, surfaced to the UI. */
export interface McpServerStatus {
  name: string;
  transport: "stdio" | "sse" | "http";
  state: "connecting" | "ready" | "error" | "needs_auth";
  toolCount: number;
  resourceCount?: number;
  promptCount?: number;
  error?: string;
}

/** MCP resource entry from resources/list. */
export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/** MCP prompt template from prompts/list. */
export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: McpContent | McpContent[];
}

export interface McpPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

export interface McpOAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes?: string[];
}

/** The `mcp` config block per server (stdio subprocess OR remote endpoint). */
export type McpServerConfig =
  | { command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean; timeoutMs?: number }
  | {
      url: string;
      type?: "sse" | "http";
      headers?: Record<string, string>;
      enabled?: boolean;
      timeoutMs?: number;
      oauth?: McpOAuthConfig;
    };

export function isStdioConfig(
  c: McpServerConfig,
): c is { command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean; timeoutMs?: number } {
  return "command" in c;
}
