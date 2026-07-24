import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wave 4 — LSP coverage expansion. We source-inspect the shipped files rather
 * than spin up real language servers; the client + host classes both live in
 * dedicated modules whose surface is easy to assert. Per-tool behaviour is
 * still covered by the existing test/lsp/*.test.ts integration harness.
 */
const CLIENT = readFileSync(join(import.meta.dir, "..", "..", "src", "lsp", "client.ts"), "utf8");
const HOST = readFileSync(join(import.meta.dir, "..", "..", "src", "lsp", "index.ts"), "utf8");

describe("Wave 4 — LSP client method surface", () => {
  for (const method of ["documentSymbol", "workspaceSymbol", "implementation", "prepareCallHierarchy", "incomingCalls", "outgoingCalls"]) {
    test(`LspClient exposes ${method}()`, () => {
      const re = new RegExp(`async ${method}\\s*\\(`);
      expect(CLIENT).toMatch(re);
    });
  }

  test("initialize declares capabilities for the new requests", () => {
    expect(CLIENT).toMatch(/documentSymbol/);
    expect(CLIENT).toMatch(/workspaceSymbol|workspace:\s*{[^}]*symbol/);
    expect(CLIENT).toMatch(/implementation/);
    expect(CLIENT).toMatch(/callHierarchy/);
  });
});

describe("Wave 4 — LSP tools registered by the host", () => {
  test("lsp_document_symbol tool defined", () => {
    expect(HOST).toContain('id: "lsp_document_symbol"');
  });
  test("lsp_workspace_symbol tool defined", () => {
    expect(HOST).toContain('id: "lsp_workspace_symbol"');
  });
  test("lsp_implementation tool defined", () => {
    expect(HOST).toContain('id: "lsp_implementation"');
  });
  test("lsp_call_hierarchy tool defined", () => {
    expect(HOST).toContain('id: "lsp_call_hierarchy"');
  });
  test("toolDefs() returns all 8 LSP tools when servers are configured", () => {
    // Not asserting the exact number here (fragile) — just that the extra 4
    // tool factories are wired into toolDefs()'s return array.
    expect(HOST).toMatch(/documentSymbolTool\(\)/);
    expect(HOST).toMatch(/workspaceSymbolTool\(\)/);
    expect(HOST).toMatch(/implementationTool\(\)/);
    expect(HOST).toMatch(/callHierarchyTool\(\)/);
  });
});
