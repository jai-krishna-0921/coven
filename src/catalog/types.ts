/**
 * Public shapes for the model catalog (models.dev + built-in fallback).
 *
 * Design note: `CatalogProvider.models` is a `Map<string, CatalogModel>`
 * (not a Record) — model lookup by ID is the hot path in `ModelCatalog.get`,
 * Map preserves insertion order for deterministic listings, and it avoids
 * prototype-pollution style pitfalls with arbitrary model IDs as keys
 * (e.g. "__proto__" appearing in remote data).
 */

/** Cost in USD per 1M tokens. */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CatalogModel {
  providerID: string;
  modelID: string;
  name: string;
  contextLimit: number;
  outputLimit: number;
  cost: ModelPricing;
  reasoning?: boolean;
  releaseDate?: string;
}

export interface CatalogProvider {
  id: string;
  name: string;
  env: string[];
  models: Map<string, CatalogModel>;
}
