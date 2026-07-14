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

  async dispose(): Promise<void> {
    await Promise.all([...this.servers.values()].map((e) => e.client.shutdown().catch(() => {})));
  }
}

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
