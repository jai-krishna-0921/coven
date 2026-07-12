/**
 * Interactive Help (§12): a custom two-pane guide — NOT a {@link SelectDialog}.
 * The left pane is the category list (Shortcuts · Commands · Agents · Skills ·
 * Permissions · Getting started); the right pane is the scrollable detail for
 * the active category, sourced from {@link BINDINGS} (Shortcuts),
 * {@link buildPaletteItems} (Commands), `agents.primaries()` (Agents),
 * `skills.all()` (Skills), and static copy for the last two. A `/`-style filter
 * narrows the visible detail rows. up/down (or ctrl+p/ctrl+n) move the category,
 * typing filters, esc closes.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { BINDINGS } from "../keymap.ts";
import { buildPaletteItems } from "../commands.ts";
import type { CommandContext } from "../types.ts";

const CATEGORIES = ["Shortcuts", "Commands", "Agents", "Skills", "Permissions", "Getting started"] as const;
type Category = (typeof CATEGORIES)[number];

/** Rows visible in the detail pane at once. */
const VISIBLE = 14;

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
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      ctx.closeModal();
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setActive((a) => Math.min(a + 1, CATEGORIES.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setActive((a) => Math.max(a - 1, 0));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab && !key.return) {
      setQuery((q) => q + input);
    }
  });

  const category = CATEGORIES[active] ?? "Shortcuts";
  const rows = filterRows(rowsFor(category, ctx), query);
  const shown = rows.slice(0, VISIBLE);
  const hidden = rows.length - shown.length;

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} paddingX={1}>
      <Text color={theme.accent} bold>
        Help
      </Text>
      <Box>
        <Text color={theme.fgSubtle}>filter </Text>
        <Text color={theme.fg}>{query}</Text>
      </Box>
      <Box flexDirection="row">
        <Box flexDirection="column" marginRight={2}>
          {CATEGORIES.map((cat, i) => {
            const isActive = i === active;
            return (
              <Text
                key={cat}
                backgroundColor={isActive ? theme.selectionBg : undefined}
                color={isActive ? theme.selectionFg : theme.fgMuted}
              >
                {cat}
              </Text>
            );
          })}
        </Box>
        <Box flexDirection="column">
          {shown.length > 0 ? (
            shown.map((r) => (
              <Text key={r.id} color={theme.fgMuted}>
                <Text color={theme.accentAlt}>{r.primary}</Text>
                {r.secondary ? `  ${r.secondary}` : ""}
              </Text>
            ))
          ) : (
            <Text color={theme.fgSubtle}>no matches</Text>
          )}
          {hidden > 0 ? <Text color={theme.fgSubtle}>… {hidden} more</Text> : null}
        </Box>
      </Box>
      <Text color={theme.fgSubtle}>↑↓ category · type to filter · esc close</Text>
    </Box>
  );
}
