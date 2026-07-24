/**
 * Composition root: wires config → bus → permissions → providers → agents →
 * skills → plugins → engine. The only place construction order lives.
 */
import { AgentRegistry } from "./agent/index.ts";
import { AuthStore } from "./auth/index.ts";
import { Bus } from "./bus/index.ts";
import { ModelCatalog } from "./catalog/index.ts";
import { CommandRegistry } from "./command/index.ts";
import { loadConfig, type LoadedConfig } from "./config/index.ts";
import { PermissionEngine, rulesFromConfig } from "./permission/index.ts";
import { QuestionEngine } from "./question/index.ts";
import type { Ruleset } from "./permission/types.ts";
import { PluginHost } from "./plugin/index.ts";
import { ProviderRegistry } from "./provider/index.ts";
import { McpHost } from "./mcp/index.ts";
import { LspHost } from "./lsp/index.ts";
import { SessionEngine } from "./session/loop.ts";
import { SessionStore } from "./session/store.ts";
import { SkillRegistry } from "./skill/index.ts";
import { SnapshotStore } from "./snapshot/index.ts";
import { Tts } from "./tts/index.ts";

/**
 * Baseline guardrails. Order matters — later rules win, and user config rules
 * are appended after these, so users can loosen or tighten anything.
 */
export const BASELINE_RULES: Ruleset = [
  { permission: "tool", pattern: "*", action: "allow" },
  { permission: "read", pattern: "*", action: "allow" },
  { permission: "read", pattern: "*.env", action: "ask" },
  { permission: "read", pattern: "*.env.*", action: "ask" },
  { permission: "read", pattern: "*id_rsa*", action: "deny" },
  { permission: "edit", pattern: "*", action: "allow" },
  { permission: "edit", pattern: ".git/*", action: "deny" },
  { permission: "bash", pattern: "*", action: "ask" },
  // Safe read-only commands preapproved:
  ...["ls", "pwd", "which", "wc", "head", "tail", "rg", "grep", "find", "cat", "git status", "git diff", "git log", "git branch", "bun test", "bun run", "node", "echo"].map(
    (cmd): Ruleset[number] => ({ permission: "bash", pattern: cmd, action: "allow" }),
  ),
  { permission: "webfetch", pattern: "*", action: "ask" },
  { permission: "task", pattern: "*", action: "allow" },
  { permission: "skill", pattern: "*", action: "allow" },
  { permission: "doom_loop", pattern: "*", action: "ask" },
  { permission: "external_directory", pattern: "*", action: "ask" },
  { permission: "external_directory", pattern: "/tmp/*", action: "allow" },
];

/** Structural seams for the optional subsystems (implemented in catalog/, auth/, tts/, command/). */
export interface CatalogModelLike {
  providerID: string;
  modelID: string;
  name: string;
  contextLimit: number;
  outputLimit: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface CatalogLike {
  get(providerID: string, modelID: string): CatalogModelLike;
  list(providerID?: string): CatalogModelLike[];
  providers(): { id: string; name: string; env: string[] }[];
}

export interface AuthLike {
  entries(): { provider: string; source: "env" | "auth.json"; masked: string }[];
  set(provider: string, key: string): void;
  setOAuth(provider: string, credential: { access: string; refresh?: string; expiresAt?: number; clientId: string; scope?: string }): void;
  remove(provider: string): boolean;
  resolveKey(provider: string): { key: string; source: "env" | "auth.json"; kind?: "api" | "oauth" } | undefined;
  getOAuth(provider: string): { access: string; refresh?: string; expiresAt?: number; clientId: string; scope?: string } | undefined;
}

export interface TtsLike {
  readonly backend: string | null;
  enabled: boolean;
  speak(text: string): void;
  stop(): void;
  status(): string;
}

export interface CommandDefLike {
  name: string;
  description: string;
  template: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
}

export interface CommandsLike {
  get(name: string): CommandDefLike | undefined;
  all(): CommandDefLike[];
  expand(
    def: CommandDefLike,
    rawArgs: string,
    opts: { root: string; gateShell?: (command: string) => Promise<boolean> },
  ): Promise<string>;
}

export interface ProvidersLike {
  invalidate(providerID?: string): void;
}

export interface App {
  loaded: LoadedConfig;
  bus: Bus;
  store: SessionStore;
  engine: SessionEngine;
  permissions: PermissionEngine;
  questions: QuestionEngine;
  agents: AgentRegistry;
  skills: SkillRegistry;
  plugins: PluginHost;
  providers: ProvidersLike;
  catalog?: CatalogLike;
  auth?: AuthLike;
  tts?: TtsLike;
  commands?: CommandsLike;
  mcp?: McpHost;
  lsp?: LspHost;
  /** Powers `/undo`/`/redo` — undefined when `snapshot: false` in config. */
  snapshot?: SnapshotStore;
  dispose(): Promise<void>;
}

export async function createApp(cwd: string = process.cwd()): Promise<App> {
  const loaded = loadConfig(cwd);
  const bus = new Bus();
  const auth = new AuthStore();
  const permissions = new PermissionEngine(bus, [...BASELINE_RULES, ...rulesFromConfig(loaded.config.permission)]);
  const questions = new QuestionEngine(bus);
  // BYOK: resolve through the auth layer (env vars AND stored auth.json), not just
  // stored keys, so e.g. OLLAMA_API_KEY / GROQ_API_KEY in the environment work.
  const providers = new ProviderRegistry(loaded.config, (providerID) => auth.resolveKey(providerID)?.key);
  const agents = new AgentRegistry(loaded.config, loaded.root);
  const [skills, plugins, catalog, commands] = await Promise.all([
    SkillRegistry.load(loaded.config, loaded.root),
    PluginHost.load(loaded.config, loaded.root, bus),
    ModelCatalog.load(),
    CommandRegistry.load(loaded.root),
  ]);
  const tts = new Tts(loaded.config.tts ?? {});
  const store = new SessionStore(loaded.root);
  // MCP + LSP setup — mcp gets an onToolsChanged callback to hot-refresh
  // the engine tool registry when a server advertises tools/list_changed.
  let mcpToolIds = new Set<string>();
  const rebuildMcpTools = () => {
    // Drop any tool previously registered from MCP, then re-register the current set.
    for (const id of mcpToolIds) engine.tools.unregister?.(id);
    mcpToolIds = new Set();
    for (const tool of mcp.toolDefs()) {
      engine.tools.register(tool);
      mcpToolIds.add(tool.id);
    }
  };
  const mcp = new McpHost(loaded.config.mcp, bus, () => rebuildMcpTools(), auth);
  const lsp = new LspHost(loaded.config.lsp, loaded.root, bus);
  const snapshot = loaded.config.snapshot === false ? undefined : new SnapshotStore(loaded.root);
  const engine = new SessionEngine({
    config: loaded.config,
    root: loaded.root,
    bus,
    store,
    providers,
    agents,
    skills,
    plugins,
    permissions,
    questions,
    snapshot,
    mcpInstructions: () => mcp.instructions(),
    modelMeta: (providerID, modelID) => {
      const model = catalog.get(providerID, modelID);
      return { contextLimit: model.contextLimit, outputLimit: model.outputLimit, cost: model.cost };
    },
  });

  // Connect MCP + LSP servers and register their tools before the first turn.
  // Failures are isolated per server; absent config makes each a no-op.
  await Promise.all([mcp.connectAll(), lsp.startAll()]);
  for (const tool of mcp.toolDefs()) {
    engine.tools.register(tool);
    mcpToolIds.add(tool.id);
  }
  for (const tool of lsp.toolDefs()) engine.tools.register(tool);

  // Auto-register MCP prompts as slash commands (source:"mcp") so every
  // connected server contributes usable slash-UI. Namespaced under the server
  // name so two servers can advertise a prompt with the same name safely.
  for (const p of mcp.promptEntries()) {
    commands.register({
      name: `mcp/${p.server}/${p.name}`,
      description: p.description ?? `MCP prompt "${p.name}" (${p.server})`,
      template: "",
      source: "mcp",
      hints: p.arguments.map((a) => `<${a.name}${a.required ? "" : "?"}>`),
      resolve: async (rawArgs) => {
        // Map raw args → the first prompt argument (single-string convention).
        // Real multi-arg calls come from the palette which knows the schema.
        const argMap: Record<string, unknown> = {};
        if (p.arguments[0]) argMap[p.arguments[0].name] = rawArgs;
        return mcp.fetchPrompt(p.server, p.name, argMap);
      },
    });
  }

  // Auto-register skills as slash commands so a user can invoke a skill
  // directly (e.g. /brainstorming) instead of going through the skill tool.
  // Skips names that already have a file-loaded or MCP command.
  for (const skill of skills.all()) {
    commands.register({
      name: skill.name,
      description: `${skill.description} (skill)`,
      template: `${skill.content}\n\n<!-- skill base directory: ${skill.dir} -->`,
      source: "skill",
      hints: [],
    });
  }

  return {
    loaded,
    bus,
    store,
    engine,
    permissions,
    questions,
    agents,
    skills,
    plugins,
    providers,
    catalog,
    auth,
    tts,
    commands,
    mcp,
    lsp,
    snapshot,
    dispose: async () => {
      tts.stop();
      await mcp.dispose();
      await lsp.dispose();
      await plugins.dispose();
    },
  };
}
