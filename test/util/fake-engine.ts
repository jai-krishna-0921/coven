/**
 * Shared fake-provider engine harness for session-engine tests.
 * Wires a real SessionEngine with a scripted provider, a temp SessionStore, a
 * real Bus, and an all-allow permission baseline. The provider records the last
 * model ref it was asked to resolve so tests can assert model precedence.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../../src/agent/index.ts";
import { Bus } from "../../src/bus/index.ts";
import type { CovenConfig } from "../../src/config/schema.ts";
import { PermissionEngine } from "../../src/permission/index.ts";
import type { Ruleset } from "../../src/permission/types.ts";
import { PluginHost } from "../../src/plugin/index.ts";
import type { LLMEvent, ProviderResolver, StreamInput } from "../../src/provider/types.ts";
import { SessionEngine } from "../../src/session/loop.ts";
import { SessionStore } from "../../src/session/store.ts";
import { SkillRegistry } from "../../src/skill/index.ts";

/** Scripted provider: plays the next batch per stream() and records resolve()'d refs. */
export class FakeProvider implements ProviderResolver {
  received: StreamInput[] = [];
  /** The most recent model ref passed to resolve() — the effective model for a turn. */
  lastResolved: string | undefined;
  private step = 0;

  constructor(private script: LLMEvent[][] = []) {}

  resolve(modelRef: string) {
    this.lastResolved = modelRef;
    const self = this;
    return {
      ref: { providerID: "fake", modelID: modelRef },
      adapter: {
        id: "fake",
        async *stream(input: StreamInput): AsyncGenerator<LLMEvent, void, void> {
          self.received.push(input);
          const events = self.script[self.step++] ?? [];
          for (const event of events) yield event;
        },
      },
    };
  }
}

const ALLOW_ALL: Ruleset = [{ permission: "*", pattern: "*", action: "allow" }];

export interface MakeEngineOptions {
  /** Per-prompt event batches; a missing batch yields an empty (clean-stop) turn. */
  script?: LLMEvent[][];
  baseline?: Ruleset;
  config?: CovenConfig;
  root?: string;
}

export interface FakeEngine {
  engine: SessionEngine;
  store: SessionStore;
  bus: Bus;
  provider: FakeProvider;
  dir: string;
}

export async function makeEngine(opts: MakeEngineOptions = {}): Promise<FakeEngine> {
  const dir = opts.root ?? mkdtempSync(join(tmpdir(), "coven-fake-"));
  const dataDir = mkdtempSync(join(tmpdir(), "coven-data-"));
  const config: CovenConfig = opts.config ?? { model: "fake/model" };
  const bus = new Bus();
  const provider = new FakeProvider(opts.script);
  const store = new SessionStore(dir, dataDir);
  const engine = new SessionEngine({
    config,
    root: dir,
    bus,
    store,
    providers: provider,
    agents: new AgentRegistry(config, dir),
    skills: await SkillRegistry.load(config, dir),
    plugins: await PluginHost.load(config, dir, bus),
    permissions: new PermissionEngine(bus, opts.baseline ?? ALLOW_ALL),
  });
  return { engine, store, bus, provider, dir };
}
