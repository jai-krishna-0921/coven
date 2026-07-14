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
import type { Ruleset } from "./permission/types.ts";
import { PluginHost } from "./plugin/index.ts";
import { ProviderRegistry } from "./provider/index.ts";
import { SessionEngine } from "./session/loop.ts";
import { SessionStore } from "./session/store.ts";
import { SkillRegistry } from "./skill/index.ts";
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
  remove(provider: string): boolean;
  resolveKey(provider: string): { key: string; source: "env" | "auth.json" } | undefined;
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
  agents: AgentRegistry;
  skills: SkillRegistry;
  plugins: PluginHost;
  providers: ProvidersLike;
  catalog?: CatalogLike;
  auth?: AuthLike;
  tts?: TtsLike;
  commands?: CommandsLike;
  dispose(): Promise<void>;
}

export async function createApp(cwd: string = process.cwd()): Promise<App> {
  const loaded = loadConfig(cwd);
  const bus = new Bus();
  const auth = new AuthStore();
  const permissions = new PermissionEngine(bus, [...BASELINE_RULES, ...rulesFromConfig(loaded.config.permission)]);
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
    modelMeta: (providerID, modelID) => {
      const model = catalog.get(providerID, modelID);
      return { contextLimit: model.contextLimit, outputLimit: model.outputLimit, cost: model.cost };
    },
  });

  return {
    loaded,
    bus,
    store,
    engine,
    permissions,
    agents,
    skills,
    plugins,
    providers,
    catalog,
    auth,
    tts,
    commands,
    dispose: async () => {
      tts.stop();
      await plugins.dispose();
    },
  };
}
