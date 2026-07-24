import { z } from "zod";

/** "allow" | "ask" | "deny", or a pattern→action map. Order matters: later entries win. */
export const PermissionValue = z.union([
  z.enum(["allow", "ask", "deny"]),
  z.record(z.string(), z.enum(["allow", "ask", "deny"])),
]);
export type PermissionValue = z.infer<typeof PermissionValue>;

export const PermissionConfig = z.record(z.string(), PermissionValue);
export type PermissionConfig = z.infer<typeof PermissionConfig>;

export const AgentConfig = z
  .object({
    description: z.string().optional(),
    mode: z.enum(["primary", "subagent", "all"]).optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    steps: z.number().int().positive().optional(),
    permission: PermissionConfig.optional(),
    disable: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
export type AgentConfig = z.infer<typeof AgentConfig>;

export const ProviderConfig = z
  .object({
    /** Environment variable holding the API key. Never the key itself. */
    apiKeyEnv: z.string().optional(),
    baseUrl: z.string().url().optional(),
    /** "anthropic" or "openai" wire protocol; defaults by provider id. */
    protocol: z.enum(["anthropic", "openai"]).optional(),
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfig>;

/** One MCP server: a local stdio subprocess OR a remote HTTP/SSE endpoint. */
export const McpServerConfig = z.union([
  z
    .object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      url: z.string().url(),
      type: z.enum(["sse", "http"]).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().optional(),
      timeoutMs: z.number().int().positive().optional(),
      /**
       * Enables `coven mcp auth <name>`. When present and a stored OAuth
       * credential exists under `mcp:<name>`, the access token is added as an
       * `Authorization: Bearer …` header on every request to `url`.
       */
      oauth: z
        .object({
          authorizationUrl: z.string().url(),
          tokenUrl: z.string().url(),
          clientId: z.string(),
          scopes: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type McpServerConfig = z.infer<typeof McpServerConfig>;

/** One LSP language server, keyed by language id (e.g. "typescript"). */
export const LspServerConfig = z
  .object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    /** File extensions this server handles, e.g. [".ts", ".tsx"]. */
    extensions: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
    /** Root marker files (e.g. ["tsconfig.json"]) — informational for now. */
    rootMarkers: z.array(z.string()).optional(),
  })
  .strict();
export type LspServerConfig = z.infer<typeof LspServerConfig>;

export const CovenConfig = z
  .object({
    $schema: z.string().optional(),
    /** Default model as "provider/model-id", e.g. "anthropic/claude-opus-4-8". */
    model: z.string().optional(),
    /** Cheap model for titles/summaries. */
    small_model: z.string().optional(),
    /** Agent to start sessions with. */
    default_agent: z.string().optional(),
    agent: z.record(z.string(), AgentConfig).optional(),
    provider: z.record(z.string(), ProviderConfig).optional(),
    permission: PermissionConfig.optional(),
    /** Extra instruction files injected into the system prompt (paths relative to config). */
    instructions: z.array(z.string()).optional(),
    skills: z.object({ paths: z.array(z.string()).optional() }).optional(),
    /** Plugin module paths (relative to config file) or package names. */
    plugins: z.array(z.string()).optional(),
    /** Hard cap on agentic iterations per user turn. */
    max_steps: z.number().int().positive().optional(),
    /** Enable per-turn file snapshots powering `/undo` and `/redo`. Default: true. */
    snapshot: z.boolean().optional(),
    /** MCP servers to connect, keyed by name. Tools appear as mcp__<name>__<tool>. */
    mcp: z.record(z.string(), McpServerConfig).optional(),
    /** LSP language servers to run, keyed by language id. */
    lsp: z.record(z.string(), LspServerConfig).optional(),
    /** Text-to-speech settings (see src/tts). */
    tts: z
      .object({
        backend: z.string().optional(),
        voice: z.string().optional(),
        rate: z.number().optional(),
        openaiVoice: z.string().optional(),
        openaiModel: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CovenConfig = z.infer<typeof CovenConfig>;

export const DEFAULT_MODEL = "anthropic/claude-opus-4-8";
export const DEFAULT_SMALL_MODEL = "anthropic/claude-haiku-4-5-20251001";
export const DEFAULT_MAX_STEPS = 100;
