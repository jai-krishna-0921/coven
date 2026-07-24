/**
 * The command catalog (§9): builtin UI actions plus template commands merged
 * from `app.commands.all()`. The same list feeds the palette, `/`-autocomplete,
 * and `/help`.
 *
 * Builtin ids are a CONTRACT: Task 11's keymap emits `{ kind: "command", id }`
 * and the App (Task 43) routes those ids by looking them up here, so the ids
 * below must match the keymap exactly. App-only capabilities (redraw, editor,
 * attach, export, interrupt, quit) are reached through `ctx.host.*` so this
 * module stays free of terminal/process concerns.
 */
import type { CommandDefLike } from "../app.ts";
import { THEMES } from "./theme.ts";
import type { CommandContext, PaletteCategory, PaletteItem } from "./types.ts";

const RECENT_CAP = 8;

/**
 * A provider's connect-status for the Connectors picker (§ Auth). Derived from
 * the live catalog + auth store — no stubs. `keyless` providers (empty `env`,
 * e.g. local Ollama) need no API key at all; keyed providers are `ready` only
 * once a key resolves from an env var or auth.json.
 */
export interface ConnectorInfo {
  id: string;
  name: string;
  keyless: boolean;
  ready: boolean;
  source?: "env" | "auth.json";
  envVar?: string;
}

/** Build the connector list from `catalog.providers()` + `auth.resolveKey()`. */
export function listConnectors(ctx: CommandContext): ConnectorInfo[] {
  const providers = ctx.app.catalog?.providers() ?? [];
  return providers.map((p) => {
    const keyless = p.env.length === 0;
    const resolved = ctx.app.auth?.resolveKey(p.id);
    return {
      id: p.id,
      name: p.name,
      keyless,
      ready: keyless || resolved !== undefined,
      source: resolved?.source,
      envVar: p.env[0],
    };
  });
}

/**
 * Run a `subtask: true` command in a child session (§9.2). The child's events
 * target its own id and are ignored by the reducer; its final assistant message
 * is folded back into the parent transcript as a display-only synthetic message.
 */
export async function runCommandSubtask(
  ctx: CommandContext,
  o: { agent: string; model?: string; text: string; label: string },
): Promise<void> {
  const child = ctx.app.store.create({ agent: o.agent, parentID: ctx.session.id, title: o.label });
  if (o.model) ctx.app.engine.setModel(child.id, o.model); // honour def.model on the child
  ctx.store.toast("▸ " + o.label + " (" + o.agent + ")…");
  const result = await ctx.app.engine.prompt(child.id, o.text, ctx.abort);
  ctx.store.appendSynthetic({ ...result, sessionID: ctx.session.id });
}

/**
 * Resolve a typed `/name args` line to the matching command + its args (§8.3/§9).
 * Returns null for non-slash text or an unknown command. Matches on `slash` or `aliases`.
 */
export function resolveSlash(
  items: PaletteItem[],
  text: string,
): { item: PaletteItem; args: string } | null {
  const t = text.trim();
  if (!t.startsWith("/")) return null;
  const body = t.slice(1);
  const sp = body.indexOf(" ");
  const name = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const args = sp === -1 ? "" : body.slice(sp + 1).trim();
  if (!name) return null;
  const item = items.find(
    (i) => i.slash.toLowerCase() === name || i.aliases?.some((a) => a.toLowerCase() === name),
  );
  return item ? { item, args } : null;
}

/** One PaletteItem per `app.commands.all()` template (§9.2 step 2). */
function templateItem(def: CommandDefLike): PaletteItem {
  const category: PaletteCategory = def.name === "init" || def.name === "review" ? "Prompt" : "Custom";
  return {
    id: "cmd:" + def.name,
    title: def.description || def.name,
    slash: def.name,
    category,
    async run(ctx, args) {
      const commands = ctx.app.commands;
      if (!commands) return;
      const text = await commands.expand(def, args ?? "", { root: ctx.app.loaded.root, gateShell: ctx.gateShell });
      if (def.subtask) {
        await runCommandSubtask(ctx, {
          agent: def.agent ?? ctx.session.agent,
          model: def.model,
          text,
          label: "/" + def.name,
        });
      } else if (def.agent || def.model) {
        await ctx.send(text, { agent: def.agent, model: def.model });
      } else {
        await ctx.send(text);
      }
    },
  };
}

/** The full merged catalog for `ctx`. Every `run` is a real function (palette lists them all). */
export function buildPaletteItems(ctx: CommandContext): PaletteItem[] {
  const items: PaletteItem[] = [
    // ---- System ----
    { id: "command.palette", title: "Command palette", slash: "palette", category: "System", keybinding: "ctrl+p", run: (c) => c.openModal("palette") },
    { id: "help", title: "Help", slash: "help", category: "System", keybinding: "?", run: (c) => c.openModal("help") },
    { id: "whichkey", title: "Keybindings", slash: "keys", category: "System", run: (c) => c.openModal("whichkey") },
    { id: "status", title: "Status", slash: "status", category: "System", run: (c) => c.openModal("status") },
    { id: "screen.clear", title: "Clear screen", slash: "clear", category: "System", keybinding: "ctrl+l", run: (c) => c.host.redraw() },
    { id: "app.quit", title: "Quit", slash: "quit", category: "System", run: (c) => c.host.quit() },
    { id: "onboarding", title: "Re-run onboarding", slash: "onboarding", category: "System", run: (c) => c.store.setReonboarding(true) },

    // ---- Session ----
    {
      id: "session.new", title: "New session", slash: "new", category: "Session", keybinding: "ctrl+n", aliases: ["clear"],
      run: (c) => c.store.setSessionID(c.app.store.create({ agent: c.session.agent, title: "New session" }).id),
    },
    { id: "session.list", title: "Sessions", slash: "sessions", category: "Session", keybinding: "ctrl+s", run: (c) => c.openModal("sessions") },
    { id: "session.resume", title: "Resume session", slash: "resume", category: "Session", run: (c) => c.openModal("sessions") },
    { id: "session.compact", title: "Compact session", slash: "compact", category: "Session", keybinding: "ctrl+shift+k", run: async (c) => { await c.app.engine.compact(c.session.id, { auto: false, abort: c.abort }); } },
    { id: "session.export", title: "Export transcript", slash: "export", category: "Session", run: async (c) => { await c.host.exportTranscript(); } },
    {
      id: "session.rename", title: "Rename session", slash: "rename", category: "Session",
      run: (c) =>
        c.openModal("prompt", {
          kind: "rename",
          message: "Rename session",
          initial: c.session.title,
          onSubmit: (title) => {
            const current = c.app.store.get(c.session.id);
            if (!current) return;
            const next = { ...current, title };
            c.app.store.update(next);
            c.app.bus.publish({ type: "session.updated", session: next });
            c.closeModal();
          },
        }),
    },
    { id: "session.interrupt", title: "Interrupt", slash: "interrupt", category: "Session", run: (c) => c.host.interrupt() },
    {
      id: "session.fork", title: "Fork session", slash: "fork", category: "Session",
      run: (c) => {
        const forked = c.app.store.fork(c.session.id);
        c.app.bus.publish({ type: "session.created", session: forked });
        c.store.setSessionID(forked.id);
      },
    },
    {
      id: "session.archive", title: "Archive session", slash: "archive", category: "Session",
      run: (c) => {
        c.app.store.setArchived(c.session.id, true);
        const current = c.app.store.get(c.session.id);
        if (current) c.app.bus.publish({ type: "session.updated", session: current });
      },
    },
    {
      id: "session.undo", title: "Undo last turn", slash: "undo", category: "Session", keybinding: "ctrl+z",
      run: (c) => {
        c.host.interrupt(); // cancel any in-flight turn first
        const outcome = c.app.engine.revert(c.session.id);
        if (!outcome) return;
        const current = c.app.store.get(c.session.id);
        if (current) c.app.bus.publish({ type: "session.updated", session: current });
        // Fire a toast-style status so the user sees what happened.
        c.app.bus.publish({
          type: "session.status",
          sessionID: c.session.id,
          status: "idle",
        });
      },
    },
    {
      id: "session.redo", title: "Redo last undo", slash: "redo", category: "Session", keybinding: "ctrl+shift+z",
      run: (c) => {
        c.app.engine.redo(c.session.id);
        const current = c.app.store.get(c.session.id);
        if (current) c.app.bus.publish({ type: "session.updated", session: current });
      },
    },

    // ---- Model / Agent ----
    { id: "model.picker", title: "Model picker", slash: "models", category: "Model", keybinding: "ctrl+o", run: (c) => c.openModal("models") },
    {
      id: "model.set", title: "Set model by ref", slash: "model", category: "Model",
      run: (c, args) => {
        const ref = (args ?? "").trim();
        if (!ref) {
          c.openModal("models");
          return;
        }
        c.app.engine.setModel(c.session.id, ref);
        c.setPrefs({ recentModels: [ref, ...c.prefs.recentModels.filter((m) => m !== ref)].slice(0, RECENT_CAP) });
        c.toast(`Model → ${ref}`, "success");
      },
    },
    { id: "agent.picker", title: "Agent picker", slash: "agents", category: "Agent", keybinding: "ctrl+g", run: (c) => c.openModal("agents") },

    // ---- Theme / View ----
    { id: "theme.picker", title: "Theme picker", slash: "themes", category: "Theme", keybinding: "ctrl+t", run: (c) => c.openModal("themes") },
    {
      id: "theme.toggle", title: "Toggle light/dark", slash: "theme-toggle", category: "Theme",
      run: (c) => {
        const theme = THEMES[c.prefs.theme];
        const sibling = theme?.light ?? theme?.dark;
        if (sibling) c.setPrefs({ theme: sibling });
      },
    },
    { id: "sidebar.toggle", title: "Toggle sidebar", slash: "sidebar", category: "View", keybinding: "ctrl+b", run: (c) => c.setPrefs({ sidebar: !c.prefs.sidebar }) },
    {
      id: "view.timestamps", title: "Toggle timestamps", slash: "timestamps", category: "View",
      run: (c) => {
        c.setPrefs({ showTimestamps: !c.prefs.showTimestamps });
        c.store.toast(c.prefs.showTimestamps ? "timestamps: off" : "timestamps: on", "info");
      },
    },
    {
      id: "view.thinking", title: "Toggle thinking blocks", slash: "thinking", category: "View",
      run: (c) => {
        c.setPrefs({ showThinking: !c.prefs.showThinking });
        c.store.toast(c.prefs.showThinking ? "thinking: hidden" : "thinking: shown", "info");
      },
    },
    {
      id: "session.copy", title: "Copy transcript to clipboard", slash: "copy", category: "Session", keybinding: "ctrl+shift+c",
      run: async (c) => {
        const messages = c.app.store.messagesOf(c.session.id);
        const lines: string[] = [`# ${c.session.title}`, ""];
        for (const m of messages) {
          const stamp = c.prefs.showTimestamps ? ` [${new Date(m.time).toISOString().slice(11, 19)}]` : "";
          lines.push(`## ${m.role}${stamp}`);
          for (const p of m.parts) {
            if (p.type === "text") lines.push(p.text);
            else if (p.type === "tool") lines.push(`> [${p.tool}] ${p.title ?? ""}\n${p.output ?? ""}`);
          }
          lines.push("");
        }
        const { copyToClipboard } = await import("../util/clipboard.ts");
        const ok = await copyToClipboard(lines.join("\n"));
        c.store.toast(ok ? "transcript copied to clipboard" : "clipboard tool not found (install xclip/wl-copy)", ok ? "success" : "warn");
      },
    },
    { id: "debug.info", title: "Debug info", slash: "debug", category: "System", run: (c) => c.openModal("status") },

    // ---- Voice / Skill ----
    {
      id: "voice.toggle", title: "Toggle voice", slash: "voice", category: "Voice",
      run: (c) => { if (c.app.tts) c.app.tts.enabled = !c.app.tts.enabled; },
      enabled: (c) => !!c.app.tts && c.app.tts.backend !== null,
    },
    { id: "skills", title: "Skills", slash: "skills", category: "Skill", run: (c) => c.openModal("skills") },

    // ---- Prompt ----
    { id: "editor.external", title: "Open editor", slash: "editor", category: "Prompt", keybinding: "ctrl+e", run: async (c) => { await c.host.openEditor(); } },
    { id: "file.attach", title: "Attach file", slash: "attach", category: "Prompt", keybinding: "ctrl+f", run: (c) => c.host.attachFile() },

    // ---- Auth ----
    { id: "auth.login", title: "Login / add provider key", slash: "login", category: "Auth", run: (c) => c.openModal("connectors") },
    { id: "connectors", title: "Connectors", slash: "connectors", category: "Auth", run: (c) => c.openModal("connectors") },
  ];

  // ---- Template commands (§9.2 step 2) ----
  const commands = ctx.app.commands;
  if (commands) {
    for (const def of commands.all()) items.push(templateItem(def));
  }

  return items;
}
