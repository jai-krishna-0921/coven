/**
 * Plugin host: loads modules from config.plugins[] and .coven/plugins/*.ts,
 * wires their event hooks to the bus, and exposes trigger() for the uniform
 * mutate-output hooks.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Bus } from "../bus/index.ts";
import type { CovenConfig } from "../config/schema.ts";
import { createLogger } from "../util/log.ts";
import type { CovenPlugin, Hooks, PluginToolDefinition } from "./types.ts";

const log = createLogger("plugin");

type HookName = "tool.execute.before" | "tool.execute.after" | "permission.ask" | "chat.params" | "chat.system";

export class PluginHost {
  private hooks: Hooks[] = [];
  loadedNames: string[] = [];

  static async load(config: CovenConfig, root: string, bus: Bus): Promise<PluginHost> {
    const host = new PluginHost();
    const specs: string[] = [...(config.plugins ?? [])];

    const pluginDir = join(root, ".coven", "plugins");
    if (existsSync(pluginDir)) {
      for (const file of readdirSync(pluginDir)) {
        if (file.endsWith(".ts") || file.endsWith(".js")) specs.push(join(pluginDir, file));
      }
    }

    for (const spec of specs) {
      try {
        const path = spec.startsWith(".") || spec.includes("/") ? resolve(root, spec) : spec;
        const module = (await import(path)) as { default?: CovenPlugin };
        if (typeof module.default !== "function") {
          log.warn("plugin has no default export", { spec });
          continue;
        }
        const hooks = await module.default({
          root,
          config,
          subscribe: (listener) => bus.subscribe(listener),
        });
        host.hooks.push(hooks);
        host.loadedNames.push(spec);
        if (hooks.event) {
          const eventHook = hooks.event.bind(hooks);
          bus.subscribe((event) => void eventHook(event));
        }
      } catch (error) {
        log.error("failed to load plugin", { spec, error: String(error) });
      }
    }
    return host;
  }

  /** Run a mutate-output hook across all plugins, in load order. */
  async trigger<I, O>(name: HookName, input: I, output: O): Promise<O> {
    for (const hooks of this.hooks) {
      const fn = hooks[name] as ((input: I, output: O) => void | Promise<void>) | undefined;
      if (!fn) continue;
      try {
        await fn(input, output);
      } catch (error) {
        log.error("plugin hook failed", { hook: name, error: String(error) });
      }
    }
    return output;
  }

  /** All plugin-registered tools, keyed by id. */
  tools(): Record<string, PluginToolDefinition> {
    const merged: Record<string, PluginToolDefinition> = {};
    for (const hooks of this.hooks) Object.assign(merged, hooks.tools ?? {});
    return merged;
  }

  async dispose(): Promise<void> {
    for (const hooks of this.hooks) {
      try {
        await hooks.dispose?.();
      } catch (error) {
        log.error("plugin dispose failed", { error: String(error) });
      }
    }
  }
}
