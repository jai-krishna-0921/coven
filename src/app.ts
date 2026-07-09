/**
 * Composition root: wires config → bus → permissions → providers → agents →
 * skills → plugins → engine. The only place construction order lives.
 */
import { AgentRegistry } from "./agent/index.ts";
import { Bus } from "./bus/index.ts";
import { loadConfig, type LoadedConfig } from "./config/index.ts";
import { PermissionEngine, rulesFromConfig } from "./permission/index.ts";
import type { Ruleset } from "./permission/types.ts";
import { PluginHost } from "./plugin/index.ts";
import { ProviderRegistry } from "./provider/index.ts";
import { SessionEngine } from "./session/loop.ts";
import { SessionStore } from "./session/store.ts";
import { SkillRegistry } from "./skill/index.ts";

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

export interface App {
  loaded: LoadedConfig;
  bus: Bus;
  store: SessionStore;
  engine: SessionEngine;
  permissions: PermissionEngine;
  agents: AgentRegistry;
  skills: SkillRegistry;
  plugins: PluginHost;
  dispose(): Promise<void>;
}

export async function createApp(cwd: string = process.cwd()): Promise<App> {
  const loaded = loadConfig(cwd);
  const bus = new Bus();
  const permissions = new PermissionEngine(bus, [...BASELINE_RULES, ...rulesFromConfig(loaded.config.permission)]);
  const providers = new ProviderRegistry(loaded.config);
  const agents = new AgentRegistry(loaded.config, loaded.root);
  const skills = await SkillRegistry.load(loaded.config, loaded.root);
  const plugins = await PluginHost.load(loaded.config, loaded.root, bus);
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
    dispose: () => plugins.dispose(),
  };
}
