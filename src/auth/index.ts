/**
 * BYOK auth store. Persists API keys per provider in <dataDir>/auth.json using
 * the shape { "<provider>": { "type": "api", "key": "..." } }. The `type`
 * discriminator mirrors opencode's design so OAuth entries can be added later
 * without a file migration. Environment variables always win over stored keys.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../util/log.ts";

const log = createLogger("auth");

/** Well-known env var per provider; presence counts as a credential without login. */
export const ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "ollama-cloud": "OLLAMA_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export interface AuthEntry {
  provider: string;
  source: "env" | "auth.json";
  masked: string;
}

interface ApiCredential {
  type: "api";
  key: string;
}

interface OAuthCredential {
  type: "oauth";
  access: string;
  refresh?: string;
  expiresAt?: number;
  clientId: string;
  scope?: string;
}

type Credential = ApiCredential | OAuthCredential;

function normalizeProvider(provider: string): string {
  return provider.toLowerCase().replace(/\/+$/, "");
}

/** Narrow an unknown auth.json value to an api-key credential. */
function asApiCredential(value: unknown): ApiCredential | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record["type"] !== "api") return undefined;
  const key = record["key"];
  if (typeof key !== "string" || key.length === 0) return undefined;
  return { type: "api", key };
}

function asOAuthCredential(value: unknown): OAuthCredential | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record["type"] !== "oauth") return undefined;
  const access = record["access"];
  const clientId = record["clientId"];
  if (typeof access !== "string" || access.length === 0) return undefined;
  if (typeof clientId !== "string") return undefined;
  return {
    type: "oauth",
    access,
    clientId,
    refresh: typeof record["refresh"] === "string" ? (record["refresh"] as string) : undefined,
    expiresAt: typeof record["expiresAt"] === "number" ? (record["expiresAt"] as number) : undefined,
    scope: typeof record["scope"] === "string" ? (record["scope"] as string) : undefined,
  };
}

function asCredential(value: unknown): Credential | undefined {
  return asApiCredential(value) ?? asOAuthCredential(value);
}

/** Mask a key for display; never reveals the middle, fully masks short keys. */
function maskKey(key: string): string {
  if (key.length <= 12) return "…";
  return key.slice(0, 8) + "…" + key.slice(-4);
}

export class AuthStore {
  private readonly dataDir: string;
  private readonly file: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(homedir(), ".local", "share", "coven");
    this.file = join(this.dataDir, "auth.json");
  }

  /** Read the raw auth.json object; corrupt or missing files are treated as empty. */
  private readRaw(): Record<string, unknown> {
    let text: string;
    try {
      text = readFileSync(this.file, "utf8");
    } catch {
      return {}; // missing or unreadable
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      log.warn("auth.json is not a JSON object; treating as empty", { file: this.file });
    } catch {
      log.warn("auth.json is corrupt; treating as empty", { file: this.file });
    }
    return {};
  }

  /** Atomic write (tmp + rename) with mode 0600. */
  private writeRaw(data: Record<string, unknown>): void {
    mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    if (process.platform !== "win32") {
      try {
        chmodSync(tmp, 0o600);
      } catch {
        // best-effort; the writeFileSync mode already applied on creation
      }
    }
    renameSync(tmp, this.file);
  }

  /** Stored key from auth.json only (env vars are not consulted). */
  get(provider: string): string | undefined {
    const value = this.readRaw()[normalizeProvider(provider)];
    const cred = asCredential(value);
    if (!cred) return undefined;
    return cred.type === "api" ? cred.key : cred.access;
  }

  /** Get the raw OAuth credential (access + refresh + expiry) for a provider. */
  getOAuth(provider: string): OAuthCredential | undefined {
    return asOAuthCredential(this.readRaw()[normalizeProvider(provider)]);
  }

  /** Resolve a usable key: the provider's env var wins, then auth.json (api or oauth access). */
  resolveKey(provider: string): { key: string; source: "env" | "auth.json"; kind?: "api" | "oauth" } | undefined {
    const id = normalizeProvider(provider);
    const envName = ENV_KEYS[id];
    if (envName !== undefined) {
      const value = process.env[envName];
      if (value !== undefined && value.length > 0) return { key: value, source: "env", kind: "api" };
    }
    const value = this.readRaw()[id];
    const cred = asCredential(value);
    if (!cred) return undefined;
    if (cred.type === "api") return { key: cred.key, source: "auth.json", kind: "api" };
    return { key: cred.access, source: "auth.json", kind: "oauth" };
  }

  set(provider: string, key: string): void {
    const id = normalizeProvider(provider);
    const data = this.readRaw();
    data[id] = { type: "api", key } satisfies ApiCredential;
    this.writeRaw(data);
    log.info("stored api key", { provider: id });
  }

  /** Save OAuth tokens obtained from the flow — access, refresh, expiry, clientId. */
  setOAuth(provider: string, credential: Omit<OAuthCredential, "type">): void {
    const id = normalizeProvider(provider);
    const data = this.readRaw();
    data[id] = { type: "oauth", ...credential } satisfies OAuthCredential;
    this.writeRaw(data);
    log.info("stored oauth credential", { provider: id, hasRefresh: !!credential.refresh });
  }

  remove(provider: string): boolean {
    const id = normalizeProvider(provider);
    const data = this.readRaw();
    if (!(id in data)) return false;
    delete data[id];
    this.writeRaw(data);
    log.info("removed api key", { provider: id });
    return true;
  }

  /** All known credentials: stored api keys plus env-detected ones, masked for display. */
  entries(): AuthEntry[] {
    const result: AuthEntry[] = [];
    for (const [provider, value] of Object.entries(this.readRaw())) {
      const credential = asCredential(value);
      if (!credential) continue;
      const shown = credential.type === "api" ? credential.key : credential.access;
      result.push({ provider, source: "auth.json", masked: maskKey(shown) });
    }
    for (const [provider, envName] of Object.entries(ENV_KEYS)) {
      const value = process.env[envName];
      if (value !== undefined && value.length > 0) {
        result.push({ provider, source: "env", masked: maskKey(value) });
      }
    }
    return result;
  }
}
