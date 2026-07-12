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
import { ENV_KEYS } from "../auth/index.ts";
import type { CommandDefLike } from "../app.ts";
import { THEMES } from "./theme.ts";
import type { CommandContext, PaletteCategory, PaletteItem } from "./types.ts";

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

/** One PaletteItem per `app.commands.all()` template (§9.2 step 2). */
function templateItem(def: CommandDefLike): PaletteItem {
  const category: PaletteCategory = def.name === "init" || def.name === "review" ? "Prompt" : "Custom";
  return {
    id: "cmd:" + def.name,
    title: def.description || def.name,
    slash: def.name,
    category,
    async run(ctx) {
      const commands = ctx.app.commands;
      if (!commands) return;
      const text = await commands.expand(def, "", { root: ctx.app.loaded.root, gateShell: ctx.gateShell });
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
    { id: "session.compact", title: "Compact session", slash: "compact", category: "Session", run: async (c) => { await c.app.engine.compact(c.session.id, { auto: false, abort: c.abort }); } },
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

    // ---- Model / Agent ----
    { id: "model.picker", title: "Model picker", slash: "models", category: "Model", keybinding: "ctrl+o", run: (c) => c.openModal("models") },
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
    {
      id: "auth.login", title: "Login", slash: "login", category: "Auth",
      run: (c) => {
        // The full provider picker (a SelectDialog over Object.keys(ENV_KEYS)) is
        // wired in Task 43; until it exists, target the active session's provider.
        const provider = c.session.model?.split("/")[0] ?? Object.keys(ENV_KEYS)[0] ?? "anthropic";
        c.openModal("prompt", {
          kind: "login",
          message: `API key for ${provider}`,
          onSubmit: (key) => {
            c.app.auth?.set(provider, key);
            c.app.providers.invalidate(provider);
            c.toast(`Saved ${provider} key`, "success");
            c.closeModal();
          },
        });
      },
    },
    { id: "connectors", title: "Connectors", slash: "connectors", category: "Auth", run: (c) => c.openModal("status") },
  ];

  // ---- Template commands (§9.2 step 2) ----
  const commands = ctx.app.commands;
  if (commands) {
    for (const def of commands.all()) items.push(templateItem(def));
  }

  return items;
}
