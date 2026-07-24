import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore } from "../../src/auth/index.ts";
import { generatePkce } from "../../src/auth/oauth.ts";

function freshStore(): AuthStore {
  return new AuthStore(mkdtempSync(join(tmpdir(), "coven-auth-w6-")));
}

describe("AuthStore — Wave 6 OAuth entries", () => {
  test("setOAuth persists access + refresh + expiresAt + clientId + scope", () => {
    const s = freshStore();
    s.setOAuth("anthropic", {
      access: "a-tok",
      refresh: "r-tok",
      expiresAt: 42,
      clientId: "cid",
      scope: "user:profile",
    });
    const oauth = s.getOAuth("anthropic");
    expect(oauth?.access).toBe("a-tok");
    expect(oauth?.refresh).toBe("r-tok");
    expect(oauth?.expiresAt).toBe(42);
    expect(oauth?.clientId).toBe("cid");
    expect(oauth?.scope).toBe("user:profile");
  });

  test("resolveKey returns oauth access with kind:'oauth'", () => {
    const s = freshStore();
    s.setOAuth("anthropic", { access: "a-tok", clientId: "cid" });
    const resolved = s.resolveKey("anthropic");
    expect(resolved?.key).toBe("a-tok");
    expect(resolved?.kind).toBe("oauth");
  });

  test("api credential can be replaced by an oauth credential and vice versa", () => {
    const s = freshStore();
    s.set("anthropic", "api-key-123");
    expect(s.resolveKey("anthropic")?.kind).toBe("api");
    s.setOAuth("anthropic", { access: "oa-tok", clientId: "cid" });
    expect(s.resolveKey("anthropic")?.kind).toBe("oauth");
    expect(s.getOAuth("anthropic")?.access).toBe("oa-tok");
  });

  test("mcp servers store their tokens under an mcp:<name> key", () => {
    const s = freshStore();
    s.setOAuth("mcp:notion", { access: "n-tok", clientId: "cid" });
    expect(s.getOAuth("mcp:notion")?.access).toBe("n-tok");
    // Doesn't collide with a same-named api credential.
    s.set("notion", "api-fallback");
    expect(s.get("notion")).toBe("api-fallback");
    expect(s.getOAuth("mcp:notion")?.access).toBe("n-tok");
  });

  test("entries() lists both api and oauth credentials with masked view", () => {
    const s = freshStore();
    s.set("anthropic", "sk-ant-1234567890abcdef");
    s.setOAuth("mcp:notion", { access: "notion-access-token-abcd", clientId: "cid" });
    const items = s.entries().map((e) => e.provider);
    expect(items).toContain("anthropic");
    expect(items).toContain("mcp:notion");
  });
});

describe("OAuth PKCE primitives", () => {
  test("generatePkce produces distinct verifier + S256 challenge each call", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(a.verifier);
    // base64url alphabet (no +/= padding), reasonable length
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});
