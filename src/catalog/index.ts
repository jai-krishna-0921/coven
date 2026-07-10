/**
 * Model catalog: models.dev api.json with a 24h disk cache and a built-in
 * fallback. `ModelCatalog.load()` never throws — any fetch/parse/cache
 * failure degrades to (stale cache →) the built-in catalog. Fetched entries
 * deep-merge OVER the builtin so local-only providers (ollama) survive.
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { NamedError } from "../util/error.ts";
import { createLogger } from "../util/log.ts";
import { BUILTIN_CATALOG } from "./fallback.ts";
import type { CatalogModel, CatalogProvider, ModelPricing } from "./types.ts";

export type { CatalogModel, CatalogProvider, ModelPricing } from "./types.ts";
export { BUILTIN_CATALOG } from "./fallback.ts";

const log = createLogger("catalog");

const MODELS_DEV_URL = "https://models.dev/api.json";
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class CatalogParseError extends NamedError {
  override readonly name = "CatalogParseError";
  constructor(readonly detail: string) {
    super(`Failed to parse model catalog: ${detail}`);
  }
}

/** Minimal fetch shape the catalog needs — keeps test fakes simple. */
export type CatalogFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface LoadOptions {
  /** Directory holding models.json (default: ~/.cache/coven). */
  cacheDir?: string;
  /** Injectable fetch, for tests. */
  fetchFn?: CatalogFetch;
  /** When true, never touch the network (cache/builtin only). */
  offline?: boolean;
}

// ---------------------------------------------------------------------------
// Parsing (models.dev api.json shape)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Parse a models.dev `api.json` payload: a top-level object keyed by provider
 * id, each with `name`, `env[]` and a `models{}` map carrying
 * `limit.context` / `limit.output` and `cost.{input,output,cache_read,cache_write}`.
 * Missing numeric fields become 0. Malformed provider/model entries are
 * skipped; a non-object top level throws `CatalogParseError`.
 */
export function parseModelsDev(raw: unknown): Map<string, CatalogProvider> {
  if (!isRecord(raw)) throw new CatalogParseError("top-level value is not an object");
  const out = new Map<string, CatalogProvider>();
  for (const [providerID, providerRaw] of Object.entries(raw)) {
    if (!isRecord(providerRaw)) continue;
    const models = new Map<string, CatalogModel>();
    const modelsRaw = providerRaw["models"];
    if (isRecord(modelsRaw)) {
      for (const [modelID, modelRaw] of Object.entries(modelsRaw)) {
        if (!isRecord(modelRaw)) continue;
        const limit = isRecord(modelRaw["limit"]) ? modelRaw["limit"] : {};
        const cost = isRecord(modelRaw["cost"]) ? modelRaw["cost"] : {};
        const model: CatalogModel = {
          providerID,
          modelID,
          name: asString(modelRaw["name"], modelID),
          contextLimit: asNumber(limit["context"]),
          outputLimit: asNumber(limit["output"]),
          cost: {
            input: asNumber(cost["input"]),
            output: asNumber(cost["output"]),
            cacheRead: asNumber(cost["cache_read"]),
            cacheWrite: asNumber(cost["cache_write"]),
          },
        };
        if (modelRaw["reasoning"] === true) model.reasoning = true;
        if (typeof modelRaw["release_date"] === "string") model.releaseDate = modelRaw["release_date"];
        models.set(modelID, model);
      }
    }
    out.set(providerID, {
      id: providerID,
      name: asString(providerRaw["name"], providerID),
      env: asStringArray(providerRaw["env"]),
      models,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merge / clone
// ---------------------------------------------------------------------------

function cloneCatalog(base: ReadonlyMap<string, CatalogProvider>): Map<string, CatalogProvider> {
  const out = new Map<string, CatalogProvider>();
  for (const [id, prov] of base) {
    const models = new Map<string, CatalogModel>();
    for (const [modelID, model] of prov.models) {
      models.set(modelID, { ...model, cost: { ...model.cost } });
    }
    out.set(id, { id: prov.id, name: prov.name, env: [...prov.env], models });
  }
  return out;
}

/** Deep-merge `over` on top of `base`: `over` wins per field, builtin fills gaps. */
function mergeCatalog(
  base: ReadonlyMap<string, CatalogProvider>,
  over: ReadonlyMap<string, CatalogProvider>,
): Map<string, CatalogProvider> {
  const out = cloneCatalog(base);
  for (const [id, prov] of over) {
    const existing = out.get(id);
    if (!existing) {
      out.set(id, {
        id: prov.id,
        name: prov.name,
        env: [...prov.env],
        models: new Map([...prov.models].map(([k, m]) => [k, { ...m, cost: { ...m.cost } }])),
      });
      continue;
    }
    existing.name = prov.name;
    if (prov.env.length > 0) existing.env = [...prov.env];
    for (const [modelID, model] of prov.models) {
      const baseModel = existing.models.get(modelID);
      if (!baseModel) {
        existing.models.set(modelID, { ...model, cost: { ...model.cost } });
        continue;
      }
      // Fetched entry wins, EXCEPT a missing/zero limit must not clobber a real
      // builtin value (a 0 outputLimit would make every request send max_tokens: 0).
      existing.models.set(modelID, {
        ...baseModel,
        ...model,
        contextLimit: model.contextLimit > 0 ? model.contextLimit : baseModel.contextLimit,
        outputLimit: model.outputLimit > 0 ? model.outputLimit : baseModel.outputLimit,
        cost: { ...model.cost },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function readCache(cacheFile: string): { catalog: Map<string, CatalogProvider>; fresh: boolean } | undefined {
  try {
    const stat = statSync(cacheFile);
    const catalog = parseModelsDev(JSON.parse(readFileSync(cacheFile, "utf8")));
    return { catalog, fresh: Date.now() - stat.mtimeMs < CACHE_TTL_MS };
  } catch {
    return undefined;
  }
}

function writeCacheAtomic(cacheDir: string, cacheFile: string, body: string): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.${Date.now().toString(36)}.tmp`;
    writeFileSync(tmp, body);
    renameSync(tmp, cacheFile);
  } catch (error) {
    log.warn("failed to write catalog cache", { cacheFile, error: String(error) });
  }
}

// ---------------------------------------------------------------------------
// Model id matching
// ---------------------------------------------------------------------------

/** "claude-haiku-4-5-20251001" → "claude-haiku-4-5"; also handles -YYYY-MM-DD. */
function stripDateSuffix(modelID: string): string {
  return modelID.replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "");
}

// ---------------------------------------------------------------------------
// ModelCatalog
// ---------------------------------------------------------------------------

export class ModelCatalog {
  private constructor(private readonly catalog: Map<string, CatalogProvider>) {}

  /**
   * Load the catalog. Order: fresh disk cache (mtime < 24h) → network fetch
   * (unless offline; 5s timeout; cache written atomically on success) →
   * stale disk cache → built-in fallback. Never throws.
   */
  static async load(opts?: LoadOptions): Promise<ModelCatalog> {
    const cacheDir = opts?.cacheDir ?? join(homedir(), ".cache", "coven");
    const cacheFile = join(cacheDir, "models.json");

    const cached = readCache(cacheFile);
    if (cached?.fresh) return new ModelCatalog(mergeCatalog(BUILTIN_CATALOG, cached.catalog));

    if (!opts?.offline) {
      try {
        const fetchFn: CatalogFetch = opts?.fetchFn ?? fetch;
        const response = await fetchFn(MODELS_DEV_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) throw new CatalogParseError(`models.dev responded ${response.status}`);
        const body = await response.text();
        const fetched = parseModelsDev(JSON.parse(body));
        writeCacheAtomic(cacheDir, cacheFile, body);
        return new ModelCatalog(mergeCatalog(BUILTIN_CATALOG, fetched));
      } catch (error) {
        log.warn("catalog fetch failed, falling back", { error: String(error) });
      }
    }

    if (cached) return new ModelCatalog(mergeCatalog(BUILTIN_CATALOG, cached.catalog));
    return new ModelCatalog(cloneCatalog(BUILTIN_CATALOG));
  }

  /**
   * Look up a model. Never returns undefined: unknown models get a
   * synthesized conservative entry (ctx 200k / out 32k, zero cost).
   * Matching: exact id, then date-suffix-insensitive both ways.
   */
  get(providerID: string, modelID: string): CatalogModel {
    const provider = this.catalog.get(providerID);
    if (provider) {
      const exact = provider.models.get(modelID);
      if (exact) return exact;
      const stripped = stripDateSuffix(modelID);
      const byStripped = provider.models.get(stripped);
      if (byStripped) return byStripped;
      for (const [key, model] of provider.models) {
        const keyStripped = stripDateSuffix(key);
        if (keyStripped === modelID || keyStripped === stripped) return model;
      }
    }
    return {
      providerID,
      modelID,
      name: modelID,
      contextLimit: 200_000,
      outputLimit: 32_000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
  }

  /** All models, or just one provider's. Unknown provider → empty array. */
  list(providerID?: string): CatalogModel[] {
    if (providerID !== undefined) {
      const provider = this.catalog.get(providerID);
      return provider ? [...provider.models.values()] : [];
    }
    const out: CatalogModel[] = [];
    for (const provider of this.catalog.values()) out.push(...provider.models.values());
    return out;
  }

  providers(): { id: string; name: string; env: string[] }[] {
    return [...this.catalog.values()].map((p) => ({ id: p.id, name: p.name, env: [...p.env] }));
  }
}
