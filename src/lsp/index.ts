/**
 * LSP host: starts one language server per configured language, routes files to
 * the right server by extension, keeps a live diagnostics store, and exposes
 * four agent tools — lsp_diagnostics / lsp_hover / lsp_definition /
 * lsp_references. A server that fails to start is isolated; the rest keep
 * working. Positions in the tools are 1-based (matching the read tool's line
 * numbers) and converted to LSP's 0-based internally.
 */
import { readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { defineTool, truncateOutput, type ToolDef } from "../tool/types.ts";
import { createLogger } from "../util/log.ts";
import type { Bus } from "../bus/index.ts";
import type { LspServerConfig } from "../config/schema.ts";
import { LspClient } from "./client.ts";
import { LspStdioTransport } from "./transport.ts";
import { SEVERITY_LABEL, type Diagnostic, type Location, type LspServerStatus } from "./types.ts";

export type { LspServerStatus } from "./types.ts";

const log = createLogger("lsp");
const DIAGNOSTICS_WAIT_MS = 3_000;

interface ServerEntry {
  client: LspClient;
  status: LspServerStatus;
  extensions: string[];
}

interface DiagWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

export class LspHost {
  private servers = new Map<string, ServerEntry>(); // language → server
  private extToLang = new Map<string, string>();
  private diagnostics = new Map<string, Diagnostic[]>(); // uri → diagnostics
  private open = new Map<string, { language: string; version: number }>(); // uri → doc state
  private diagWaiters = new Map<string, DiagWaiter[]>();
  private readonly rootUri: string;

  constructor(
    private readonly config: Record<string, LspServerConfig> | undefined,
    private readonly root: string,
    private readonly bus?: Bus,
  ) {
    this.rootUri = pathToFileURL(root).href;
  }

  async startAll(): Promise<void> {
    if (!this.config) return;
    const entries = Object.entries(this.config).filter(([, cfg]) => cfg.enabled !== false);
    for (const [lang, cfg] of entries) {
      for (const ext of cfg.extensions) this.extToLang.set(ext, lang);
    }
    await Promise.all(entries.map(([lang, cfg]) => this.startServer(lang, cfg)));
  }

  private async startServer(lang: string, cfg: LspServerConfig): Promise<void> {
    const transport = new LspStdioTransport(cfg.command, cfg.args ?? [], this.root, cfg.env);
    const status: LspServerStatus = { language: lang, command: cfg.command, state: "starting", openFiles: 0, diagnostics: 0 };
    const client = new LspClient(transport, {
      rootUri: this.rootUri,
      onDiagnostics: (uri, diags) => this.onDiagnostics(lang, uri, diags),
    });
    this.servers.set(lang, { client, status, extensions: cfg.extensions });
    this.emit(status);
    try {
      await client.initialize();
      status.state = "ready";
      log.info("lsp server ready", { lang, command: cfg.command });
    } catch (error) {
      status.state = "error";
      status.error = String(error);
      await client.shutdown().catch(() => {});
      log.warn("lsp server failed", { lang, error: String(error) });
    }
    this.emit(status);
  }

  private onDiagnostics(lang: string, uri: string, diags: Diagnostic[]): void {
    this.diagnostics.set(uri, diags);
    const entry = this.servers.get(lang);
    if (entry) {
      entry.status.diagnostics = this.countFor(lang);
      this.emit(entry.status);
    }
    this.bus?.publish({ type: "lsp.diagnostics", uri, count: diags.length });
    const waiters = this.diagWaiters.get(uri);
    if (waiters) {
      this.diagWaiters.delete(uri);
      for (const w of waiters) {
        clearTimeout(w.timer);
        w.resolve();
      }
    }
  }

  private countFor(lang: string): number {
    let total = 0;
    for (const [uri, diags] of this.diagnostics) {
      if (this.open.get(uri)?.language === lang) total += diags.length;
    }
    return total;
  }

  private emit(status: LspServerStatus): void {
    this.bus?.publish({ type: "lsp.status", status: { ...status } });
  }

  private serverForPath(absPath: string): { lang: string; entry: ServerEntry } | undefined {
    const lang = this.extToLang.get(extname(absPath));
    if (!lang) return undefined;
    const entry = this.servers.get(lang);
    if (!entry || entry.status.state !== "ready") return undefined;
    return { lang, entry };
  }

  /** Open (or re-sync) a file with its language server; returns its file URI. */
  private ensureOpen(absPath: string): { uri: string; entry: ServerEntry } | { error: string } {
    const found = this.serverForPath(absPath);
    if (!found) return { error: `no ready LSP server for ${extname(absPath) || "this file type"}` };
    let text: string;
    try {
      text = readFileSync(absPath, "utf8");
    } catch (error) {
      return { error: `cannot read ${absPath}: ${String(error)}` };
    }
    const uri = pathToFileURL(absPath).href;
    const state = this.open.get(uri);
    if (!state) {
      found.entry.client.didOpen(uri, found.lang, 1, text);
      this.open.set(uri, { language: found.lang, version: 1 });
      found.entry.status.openFiles++;
    } else {
      state.version += 1;
      found.entry.client.didChange(uri, state.version, text);
    }
    return { uri, entry: found.entry };
  }

  private abs(path: string): string {
    return isAbsolute(path) ? path : resolvePath(this.root, path);
  }

  private rel(uri: string): string {
    try {
      const p = fileURLToPath(uri);
      const r = relative(this.root, p);
      return r.startsWith("..") ? p : r;
    } catch {
      return uri;
    }
  }

  private locations(result: Location | Location[] | null): Location[] {
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }

  /** Wait for a fresh publishDiagnostics for `uri`, or fall back after a timeout. */
  private waitForDiagnostics(uri: string): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const list = this.diagWaiters.get(uri)?.filter((w) => w.timer !== timer) ?? [];
        if (list.length) this.diagWaiters.set(uri, list);
        else this.diagWaiters.delete(uri);
        resolve();
      }, DIAGNOSTICS_WAIT_MS);
      const existing = this.diagWaiters.get(uri) ?? [];
      existing.push({ resolve, timer });
      this.diagWaiters.set(uri, existing);
    });
  }

  // --- Public API -----------------------------------------------------------

  status(): LspServerStatus[] {
    return [...this.servers.values()].map((e) => ({ ...e.status }));
  }

  /** All diagnostics across open files, formatted for display/agent. */
  allDiagnostics(): { file: string; line: number; severity: string; message: string }[] {
    const out: { file: string; line: number; severity: string; message: string }[] = [];
    for (const [uri, diags] of this.diagnostics) {
      for (const d of diags) {
        out.push({
          file: this.rel(uri),
          line: d.range.start.line + 1,
          severity: SEVERITY_LABEL[d.severity ?? 1] ?? "info",
          message: d.message,
        });
      }
    }
    return out;
  }

  toolDefs(): ToolDef<never>[] {
    if (this.servers.size === 0) return [];
    return [
      this.diagnosticsTool(),
      this.hoverTool(),
      this.definitionTool(),
      this.referencesTool(),
      this.implementationTool(),
      this.documentSymbolTool(),
      this.workspaceSymbolTool(),
      this.callHierarchyTool(),
    ] as ToolDef<never>[];
  }

  private diagnosticsTool(): ToolDef<{ path: string }> {
    return defineTool({
      id: "lsp_diagnostics",
      description: "Get language-server diagnostics (errors/warnings) for a file. Opens the file and waits briefly for analysis.",
      parameters: z.object({ path: z.string().describe("File path (relative to the workspace root or absolute)") }),
      execute: async (args) => {
        const absPath = this.abs(args.path);
        const opened = this.ensureOpen(absPath);
        if ("error" in opened) return { title: `lsp diagnostics ${args.path}`, output: opened.error, metadata: { isError: true } };
        await this.waitForDiagnostics(opened.uri);
        const diags = this.diagnostics.get(opened.uri) ?? [];
        if (diags.length === 0) return { title: `lsp diagnostics ${args.path}`, output: "No diagnostics — clean." };
        const lines = diags
          .map((d) => `${SEVERITY_LABEL[d.severity ?? 1] ?? "info"} ${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}${d.source ? ` [${d.source}]` : ""}`)
          .join("\n");
        return { title: `lsp diagnostics ${args.path}`, output: truncateOutput(lines), metadata: { count: diags.length } };
      },
    });
  }

  private hoverTool(): ToolDef<{ path: string; line: number; character: number }> {
    return defineTool({
      id: "lsp_hover",
      description: "Hover info (type/signature/docs) at a 1-based line:character in a file.",
      parameters: z.object({
        path: z.string(),
        line: z.number().int().positive().describe("1-based line number"),
        character: z.number().int().positive().describe("1-based column"),
      }),
      execute: async (args) => {
        const opened = this.ensureOpen(this.abs(args.path));
        if ("error" in opened) return { title: `lsp hover ${args.path}`, output: opened.error, metadata: { isError: true } };
        const result = (await opened.entry.client
          .hover(opened.uri, { line: args.line - 1, character: args.character - 1 })
          .catch((e) => ({ _error: String(e) }))) as { contents?: unknown; _error?: string } | null;
        if (result && "_error" in result && result._error) return { title: `lsp hover ${args.path}`, output: result._error, metadata: { isError: true } };
        const text = renderHover(result?.contents);
        return { title: `lsp hover ${args.path}:${args.line}:${args.character}`, output: text || "No hover info." };
      },
    });
  }

  private definitionTool(): ToolDef<{ path: string; line: number; character: number }> {
    return defineTool({
      id: "lsp_definition",
      description: "Go to definition of the symbol at a 1-based line:character. Returns file:line locations.",
      parameters: z.object({ path: z.string(), line: z.number().int().positive(), character: z.number().int().positive() }),
      execute: async (args) => {
        const opened = this.ensureOpen(this.abs(args.path));
        if ("error" in opened) return { title: `lsp definition ${args.path}`, output: opened.error, metadata: { isError: true } };
        const result = await opened.entry.client
          .definition(opened.uri, { line: args.line - 1, character: args.character - 1 })
          .catch(() => null);
        const locs = this.locations(result);
        if (locs.length === 0) return { title: `lsp definition ${args.path}`, output: "No definition found." };
        const out = locs.map((l) => `${this.rel(l.uri)}:${l.range.start.line + 1}:${l.range.start.character + 1}`).join("\n");
        return { title: `lsp definition ${args.path}:${args.line}:${args.character}`, output: out };
      },
    });
  }

  private referencesTool(): ToolDef<{ path: string; line: number; character: number }> {
    return defineTool({
      id: "lsp_references",
      description: "Find references to the symbol at a 1-based line:character. Returns file:line locations.",
      parameters: z.object({ path: z.string(), line: z.number().int().positive(), character: z.number().int().positive() }),
      execute: async (args) => {
        const opened = this.ensureOpen(this.abs(args.path));
        if ("error" in opened) return { title: `lsp references ${args.path}`, output: opened.error, metadata: { isError: true } };
        const locs = await opened.entry.client
          .references(opened.uri, { line: args.line - 1, character: args.character - 1 })
          .catch(() => [] as Location[]);
        if (locs.length === 0) return { title: `lsp references ${args.path}`, output: "No references found." };
        const out = locs.map((l) => `${this.rel(l.uri)}:${l.range.start.line + 1}:${l.range.start.character + 1}`).join("\n");
        return { title: `lsp references ${args.path}:${args.line}:${args.character}`, output: truncateOutput(out), metadata: { count: locs.length } };
      },
    });
  }

  private implementationTool(): ToolDef<{ path: string; line: number; character: number }> {
    return defineTool({
      id: "lsp_implementation",
      description: "Go to implementation(s) of the symbol at 1-based line:character (interfaces → concrete types, etc).",
      parameters: z.object({ path: z.string(), line: z.number().int().positive(), character: z.number().int().positive() }),
      execute: async (args) => {
        const opened = this.ensureOpen(this.abs(args.path));
        if ("error" in opened) return { title: `lsp implementation ${args.path}`, output: opened.error, metadata: { isError: true } };
        const result = await opened.entry.client
          .implementation(opened.uri, { line: args.line - 1, character: args.character - 1 })
          .catch(() => null);
        const locs = this.locations(result);
        if (locs.length === 0) return { title: `lsp implementation ${args.path}`, output: "No implementation found." };
        const out = locs.map((l) => `${this.rel(l.uri)}:${l.range.start.line + 1}:${l.range.start.character + 1}`).join("\n");
        return { title: `lsp implementation ${args.path}:${args.line}:${args.character}`, output: truncateOutput(out), metadata: { count: locs.length } };
      },
    });
  }

  private documentSymbolTool(): ToolDef<{ path: string }> {
    return defineTool({
      id: "lsp_document_symbol",
      description: "List the symbols (classes/functions/methods/vars) declared in a file, as a flat name → line:col:kind list.",
      parameters: z.object({ path: z.string() }),
      execute: async (args) => {
        const opened = this.ensureOpen(this.abs(args.path));
        if ("error" in opened) return { title: `lsp symbols ${args.path}`, output: opened.error, metadata: { isError: true } };
        const symbols = await opened.entry.client.documentSymbol(opened.uri).catch(() => [] as unknown[]);
        const flat = flattenSymbols(symbols);
        if (flat.length === 0) return { title: `lsp symbols ${args.path}`, output: "No symbols reported." };
        const out = flat
          .slice(0, 500)
          .map((s) => `${SYMBOL_KIND[s.kind ?? 0] ?? "?"} ${s.line + 1}:${s.character + 1} ${s.name}`)
          .join("\n");
        return { title: `lsp symbols ${args.path}`, output: truncateOutput(out), metadata: { count: flat.length } };
      },
    });
  }

  private workspaceSymbolTool(): ToolDef<{ query: string }> {
    return defineTool({
      id: "lsp_workspace_symbol",
      description: "Search all workspace files for a symbol by name (across every started language server). Cap: 10 hits/server.",
      parameters: z.object({ query: z.string().describe("Case-insensitive symbol name / substring") }),
      execute: async (args) => {
        const perServer = await Promise.all(
          [...this.servers.values()].map(async (entry) => {
            try {
              const hits = (await entry.client.workspaceSymbol(args.query)) as WorkspaceSymbol[];
              return hits.slice(0, 10);
            } catch {
              return [] as WorkspaceSymbol[];
            }
          }),
        );
        const all = perServer.flat();
        if (all.length === 0) return { title: `lsp workspace-symbol "${args.query}"`, output: "No matches." };
        const out = all
          .map((s) => {
            const loc = s.location ?? (s as { locations?: unknown[] }).locations?.[0];
            const uri = loc && typeof loc === "object" && "uri" in loc ? (loc as { uri: string }).uri : "";
            const line =
              loc && typeof loc === "object" && "range" in loc
                ? ((loc as { range: { start: { line: number } } }).range.start.line + 1)
                : 0;
            const rel = uri ? this.rel(uri) : "?";
            return `${SYMBOL_KIND[s.kind ?? 0] ?? "?"} ${rel}:${line} ${s.name}`;
          })
          .join("\n");
        return { title: `lsp workspace-symbol "${args.query}"`, output: truncateOutput(out), metadata: { count: all.length } };
      },
    });
  }

  private callHierarchyTool(): ToolDef<{ path: string; line: number; character: number; direction: "incoming" | "outgoing" }> {
    return defineTool({
      id: "lsp_call_hierarchy",
      description:
        "Show who calls this function (direction=incoming) or which functions this one calls (direction=outgoing). Runs prepareCallHierarchy first.",
      parameters: z.object({
        path: z.string(),
        line: z.number().int().positive(),
        character: z.number().int().positive(),
        direction: z.enum(["incoming", "outgoing"]).default("incoming"),
      }),
      execute: async (args) => {
        const opened = this.ensureOpen(this.abs(args.path));
        if ("error" in opened) return { title: `lsp call-hierarchy ${args.path}`, output: opened.error, metadata: { isError: true } };
        const items = await opened.entry.client
          .prepareCallHierarchy(opened.uri, { line: args.line - 1, character: args.character - 1 })
          .catch(() => [] as unknown[]);
        if (items.length === 0) {
          return { title: `lsp call-hierarchy ${args.path}`, output: "No call-hierarchy item at position." };
        }
        const calls = await Promise.all(
          items.map((item) =>
            args.direction === "outgoing"
              ? opened.entry.client.outgoingCalls(item).catch(() => [] as unknown[])
              : opened.entry.client.incomingCalls(item).catch(() => [] as unknown[]),
          ),
        );
        const flat = calls.flat() as Array<{ from?: CallHierarchyItem; to?: CallHierarchyItem; fromRanges?: unknown[] }>;
        if (flat.length === 0) return { title: `lsp call-hierarchy ${args.path}`, output: `No ${args.direction} calls.` };
        const rendered = flat
          .map((entry) => {
            const target = args.direction === "outgoing" ? entry.to : entry.from;
            if (!target) return "";
            const uri = target.uri ?? "";
            const line = target.range?.start?.line ?? target.selectionRange?.start?.line ?? 0;
            return `${SYMBOL_KIND[target.kind ?? 0] ?? "?"} ${uri ? this.rel(uri) : "?"}:${line + 1} ${target.name}`;
          })
          .filter(Boolean)
          .join("\n");
        return {
          title: `lsp call-hierarchy ${args.direction} ${args.path}:${args.line}:${args.character}`,
          output: truncateOutput(rendered),
          metadata: { count: flat.length },
        };
      },
    });
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.servers.values()].map((e) => e.client.shutdown().catch(() => {})));
  }
}

interface WorkspaceSymbol {
  name: string;
  kind?: number;
  location?: { uri: string; range: { start: { line: number; character: number } } };
}

interface CallHierarchyItem {
  name: string;
  kind?: number;
  uri: string;
  range?: { start: { line: number; character: number } };
  selectionRange?: { start: { line: number; character: number } };
}

interface FlatSymbol {
  name: string;
  kind?: number;
  line: number;
  character: number;
}

/** Flatten either DocumentSymbol (nested `children`) or SymbolInformation (flat with `location`). */
function flattenSymbols(symbols: unknown[]): FlatSymbol[] {
  const out: FlatSymbol[] = [];
  function walk(entry: unknown, prefix?: string) {
    if (!entry || typeof entry !== "object") return;
    const e = entry as {
      name: string;
      kind?: number;
      range?: { start: { line: number; character: number } };
      selectionRange?: { start: { line: number; character: number } };
      location?: { range: { start: { line: number; character: number } } };
      children?: unknown[];
    };
    const start = e.selectionRange?.start ?? e.range?.start ?? e.location?.range.start;
    if (start) {
      out.push({ name: prefix ? `${prefix}.${e.name}` : e.name, kind: e.kind, line: start.line, character: start.character });
    }
    for (const child of e.children ?? []) walk(child, prefix ? `${prefix}.${e.name}` : e.name);
  }
  for (const entry of symbols) walk(entry);
  return out;
}

const SYMBOL_KIND: Record<number, string> = {
  1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class", 6: "method", 7: "property",
  8: "field", 9: "constructor", 10: "enum", 11: "interface", 12: "function", 13: "variable",
  14: "constant", 15: "string", 16: "number", 17: "boolean", 18: "array", 19: "object", 20: "key",
  21: "null", 22: "enum-member", 23: "struct", 24: "event", 25: "operator", 26: "type-parameter",
};

/** LSP hover `contents` is markup | markup[] | {language,value}[] — flatten to text. */
function renderHover(contents: unknown): string {
  if (contents == null) return "";
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) return contents.map(renderHover).filter(Boolean).join("\n");
  if (typeof contents === "object") {
    const c = contents as { value?: unknown; kind?: unknown };
    if (typeof c.value === "string") return c.value;
  }
  return "";
}
