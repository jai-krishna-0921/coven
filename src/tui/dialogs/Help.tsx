/**
 * Interactive Help (§12): a custom two-pane guide — NOT a {@link SelectDialog}.
 *
 * Left pane: the category tabs (fixed-width column so a two-word label like
 * "Getting started" never wraps and desyncs the rows). Right pane: the
 * scrollable detail for the active category, laid out as two columns — a
 * fixed-width `primary` (key / name / slash) and a flex `secondary` that WRAPS
 * with a hanging indent (continuation lines align under the description, not
 * back at column 0). Sources: {@link BINDINGS} (Shortcuts),
 * {@link buildPaletteItems} (Commands), `agents.primaries()` (Agents),
 * `skills.all()` (Skills), and static copy for the last two.
 *
 * Keys: tab / shift+tab / ←/→ switch category; ↑/↓ scroll the detail; PgUp/PgDn
 * scroll a page; type to filter; esc closes. The panel is width-capped so it
 * doesn't stretch edge-to-edge, and the visible-row budget tracks the terminal
 * height so nothing overflows.
 */
import { useState } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useTheme } from "../context.tsx";
import { BINDINGS } from "../keymap.ts";
import { buildPaletteItems } from "../commands.ts";
import type { CommandContext } from "../types.ts";

const CATEGORIES = ["Shortcuts", "Commands", "Agents", "Skills", "Permissions", "Getting started"] as const;
type Category = (typeof CATEGORIES)[number];

const PANEL_MAX_W = 100;
const LEFT_W = 18; // fits "› Getting started" (17) without wrapping/truncation
const PRIMARY_MAX_W = 26;
const MIN_VISIBLE = 6;

interface HelpRow {
  id: string;
  primary: string;
  secondary?: string;
}

const PERMISSION_ROWS: HelpRow[] = [
  { id: "perm-y", primary: "y", secondary: "allow once" },
  { id: "perm-a", primary: "a", secondary: "allow always (this session)" },
  { id: "perm-n", primary: "n", secondary: "reject — then type optional feedback" },
  { id: "perm-rules", primary: "rules", secondary: "coven.json permission rules refine the defaults" },
];

const GETTING_STARTED_ROWS: HelpRow[] = [
  { id: "gs-type", primary: "type", secondary: "ask anything — enter sends, shift+enter for a newline" },
  { id: "gs-cmd", primary: "/", secondary: "slash commands — the popover narrows as you type; enter runs" },
  { id: "gs-conn", primary: "/login", secondary: "connect a provider (Ollama is local & keyless)" },
  { id: "gs-shell", primary: "!cmd", secondary: "run a shell command (permission-gated)" },
  { id: "gs-file", primary: "@path", secondary: "attach a file by mention" },
  { id: "gs-help", primary: "?", secondary: "open this help any time" },
];

function rowsFor(category: Category, ctx: CommandContext): HelpRow[] {
  switch (category) {
    case "Shortcuts":
      return BINDINGS.map((b) => ({ id: `sc-${b.key}-${b.action}`, primary: b.key, secondary: b.action }));
    case "Commands":
      return buildPaletteItems(ctx).map((i) => ({ id: `cmd-${i.id}`, primary: `/${i.slash}`, secondary: i.title }));
    case "Agents":
      return ctx.app.agents.primaries().map((a) => ({ id: `ag-${a.name}`, primary: a.name, secondary: `${a.mode} · ${a.description}` }));
    case "Skills":
      return ctx.app.skills.all().map((s) => ({ id: `sk-${s.name}`, primary: s.name, secondary: s.description }));
    case "Permissions":
      return PERMISSION_ROWS;
    case "Getting started":
      return GETTING_STARTED_ROWS;
  }
}

function filterRows(rows: HelpRow[], query: string): HelpRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${r.primary} ${r.secondary ?? ""}`.toLowerCase().includes(q));
}

export function Help({ ctx }: { ctx: CommandContext }) {
  const { theme, borders } = useTheme();
  const size = useWindowSize();
  const columns = size.columns || 80;
  const termRows = size.rows || 24;

  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);

  const switchCategory = (delta: number): void => {
    setActive((a) => Math.min(Math.max(a + delta, 0), CATEGORIES.length - 1));
    setScroll(0);
    setQuery("");
  };

  const category = CATEGORIES[active] ?? "Shortcuts";
  const rows = filterRows(rowsFor(category, ctx), query);

  const panelW = Math.min(Math.max(48, columns - 4), PANEL_MAX_W);
  // Reserve rows for the border (2), title, filter, and footer.
  const visible = Math.max(MIN_VISIBLE, termRows - 9);
  const maxScroll = Math.max(0, rows.length - visible);
  const clampedScroll = Math.min(Math.max(0, scroll), maxScroll);
  const shown = rows.slice(clampedScroll, clampedScroll + visible);
  const above = clampedScroll;
  const below = rows.length - (clampedScroll + shown.length);

  const primaryW = Math.min(PRIMARY_MAX_W, Math.max(6, ...rows.map((r) => r.primary.length)) + 2);

  useInput((input, key) => {
    if (key.escape) {
      ctx.closeModal();
      return;
    }
    if (key.tab) {
      switchCategory(key.shift ? -1 : 1);
      return;
    }
    if (key.rightArrow) {
      switchCategory(1);
      return;
    }
    if (key.leftArrow) {
      switchCategory(-1);
      return;
    }
    if (key.downArrow) {
      setScroll((s) => Math.min(s + 1, maxScroll));
      return;
    }
    if (key.upArrow) {
      setScroll((s) => Math.max(s - 1, 0));
      return;
    }
    if (key.pageDown) {
      setScroll((s) => Math.min(s + visible, maxScroll));
      return;
    }
    if (key.pageUp) {
      setScroll((s) => Math.max(s - visible, 0));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setScroll(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.return) {
      setQuery((q) => q + input);
      setScroll(0);
    }
  });

  return (
    <Box
      flexDirection="column"
      width={panelW}
      borderStyle={borders as "round" | "classic"}
      borderColor={theme.borderFocus}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={theme.accent} bold>
          Help — {category}
        </Text>
        <Text color={theme.fgSubtle}>{active + 1}/{CATEGORIES.length}</Text>
      </Box>
      <Box>
        <Text color={theme.fgSubtle}>filter </Text>
        <Text color={theme.fg}>{query || " "}</Text>
      </Box>

      <Box flexDirection="row" marginTop={1}>
        {/* Left: category tabs (fixed width, no wrap) */}
        <Box flexDirection="column" width={LEFT_W} flexShrink={0} marginRight={1}>
          {CATEGORIES.map((cat, i) => {
            const isActive = i === active;
            return (
              <Text
                key={cat}
                wrap="truncate-end"
                backgroundColor={isActive ? theme.selectionBg : undefined}
                color={isActive ? theme.selectionFg : theme.fgMuted}
              >
                {isActive ? "> " : "  "}
                {cat}
              </Text>
            );
          })}
        </Box>

        {/* Right: scrollable detail, two-column with hanging-indent wrap */}
        <Box flexDirection="column" flexGrow={1}>
          {above > 0 ? <Text color={theme.fgSubtle}>{`  ${above} more above`}</Text> : null}
          {shown.length > 0 ? (
            shown.map((r) => (
              <Box key={r.id} flexDirection="row">
                <Box width={primaryW} flexShrink={0}>
                  <Text color={theme.accentAlt} wrap="truncate-end">
                    {r.primary}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={theme.fgMuted}>{r.secondary ?? ""}</Text>
                </Box>
              </Box>
            ))
          ) : (
            <Text color={theme.fgSubtle}>no matches</Text>
          )}
          {below > 0 ? <Text color={theme.fgSubtle}>{`  ${below} more below`}</Text> : null}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.fgSubtle}>tab or left/right: category · up/down: scroll · type: filter · esc: close</Text>
      </Box>
    </Box>
  );
}
