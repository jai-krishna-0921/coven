/**
 * Generic filterable single-select dialog — the base most dialogs build on
 * (§12). A one-line filter narrows the list (prefix-before-fuzzy via
 * {@link filterOptions}), a windowed viewport shows ~10 rows and scrolls with
 * the selection, group headers separate `option.group` runs, and the highlighted
 * row is painted with `theme.selectionBg`/`selectionFg`. Nav is the shared modal
 * set (§10.1): up/ctrl+p, down/ctrl+n, pageup/pagedown, type-to-filter, enter
 * selects, esc cancels.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Box, Text, useInput } from "ink";
import fuzzysort from "fuzzysort";
import { useTheme } from "../context.tsx";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
}

/** Rows visible in the scroll window at once. */
const VISIBLE = 10;

/**
 * Prefix matches (label starts with the query, case-insensitive) sort ahead of
 * fuzzy matches over the remainder, so "type r → r…, type ra → ra…" stays exact
 * (§8.3). Groups are preserved: each returned option keeps its `group` field and
 * prefix matches retain their input order (so grouped input stays grouped).
 */
export function filterOptions(options: SelectOption[], query: string): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const prefix: SelectOption[] = [];
  const rest: SelectOption[] = [];
  for (const option of options) {
    if (option.label.toLowerCase().startsWith(q)) prefix.push(option);
    else rest.push(option);
  }
  const chosen = new Set(prefix);
  const fuzzy = fuzzysort
    .go(q, rest, { keys: ["label", "value", "hint"] })
    .map((result) => result.obj)
    .filter((option) => !chosen.has(option));
  return [...prefix, ...fuzzy];
}

/** Window start that keeps `sel` in view, centered when possible. */
function windowStart(sel: number, total: number): number {
  if (total <= VISIBLE) return 0;
  const half = Math.floor(VISIBLE / 2);
  return Math.min(Math.max(0, sel - half), total - VISIBLE);
}

export function SelectDialog({
  title,
  options,
  onSelect,
  onCancel,
  footer,
}: {
  title: string;
  options: SelectOption[];
  onSelect(value: string): void;
  onCancel(): void;
  footer?: string;
}) {
  const { theme, icons, borders } = useTheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = filterOptions(options, query);
  const sel = Math.min(Math.max(0, selected), Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const chosen = filtered[sel];
      if (chosen) onSelect(chosen.value);
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelected((s) => Math.min(s + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
    if (key.pageDown) {
      setSelected((s) => Math.min(s + VISIBLE, Math.max(0, filtered.length - 1)));
      return;
    }
    if (key.pageUp) {
      setSelected((s) => Math.max(s - VISIBLE, 0));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setSelected(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((q) => q + input);
      setSelected(0);
    }
  });

  const start = windowStart(sel, filtered.length);
  const windowOptions = filtered.slice(start, start + VISIBLE);

  const rows: ReactNode[] = [];
  let prevGroup: string | undefined;
  windowOptions.forEach((option, i) => {
    const absolute = start + i;
    if (option.group && option.group !== prevGroup) {
      rows.push(
        <Text key={`grp-${option.group}-${absolute}`} color={theme.fgSubtle} bold>
          {option.group}
        </Text>,
      );
    }
    prevGroup = option.group;
    const isSelected = absolute === sel;
    rows.push(
      <Text
        key={option.value}
        backgroundColor={isSelected ? theme.selectionBg : undefined}
        color={isSelected ? theme.selectionFg : theme.fg}
      >
        {isSelected ? icons.arrow : " "} {option.label}
        {option.hint ? `  ${option.hint}` : ""}
      </Text>,
    );
  });

  const hiddenBelow = filtered.length - (start + VISIBLE);

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} paddingX={1}>
      <Text color={theme.accent} bold>
        {title}
      </Text>
      <Box>
        <Text color={theme.fgSubtle}>filter </Text>
        <Text color={theme.fg}>{query}</Text>
      </Box>
      {rows.length > 0 ? rows : <Text color={theme.fgSubtle}>no matches</Text>}
      {hiddenBelow > 0 ? <Text color={theme.fgSubtle}>{icons.arrow} {hiddenBelow} more</Text> : null}
      {footer ? <Text color={theme.fgSubtle}>{footer}</Text> : null}
    </Box>
  );
}
