/**
 * Themes dialog (§12) with live preview. The seven registry themes are listed;
 * moving the highlight applies the theme immediately through `ctx.setPrefs`
 * (so the whole UI re-themes under the dialog). The entry theme is remembered:
 * `enter` commits the highlighted theme and closes; `esc` restores the entry
 * theme (`ctx.setPrefs({ theme: entry })`) and closes. Custom (not
 * {@link SelectDialog}) because the base has no per-highlight callback.
 */
import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { THEMES } from "../theme.ts";
import type { CommandContext } from "../types.ts";

const THEME_NAMES = Object.keys(THEMES);

export function Themes({ ctx }: { ctx: CommandContext }) {
  const { theme, icons, borders } = useTheme();
  /** The theme active when the dialog opened; esc restores it. Captured once. */
  const entry = useRef(ctx.prefs.theme);
  const startIndex = Math.max(0, THEME_NAMES.indexOf(ctx.prefs.theme));
  const [selected, setSelected] = useState(startIndex);

  // Live preview: apply the highlighted theme as the selection moves.
  useEffect(() => {
    const name = THEME_NAMES[selected];
    if (name && name !== ctx.prefs.theme) ctx.setPrefs({ theme: name });
    // Only re-run when the highlight moves; ctx is read fresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useInput((input, key) => {
    if (key.escape) {
      ctx.setPrefs({ theme: entry.current });
      ctx.closeModal();
      return;
    }
    if (key.return) {
      const name = THEME_NAMES[selected];
      if (name) ctx.setPrefs({ theme: name });
      ctx.closeModal();
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelected((s) => Math.min(s + 1, THEME_NAMES.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelected((s) => Math.max(s - 1, 0));
    }
  });

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} paddingX={1}>
      <Text color={theme.accent} bold>
        Themes
      </Text>
      {THEME_NAMES.map((name, i) => {
        const isSelected = i === selected;
        return (
          <Text
            key={name}
            backgroundColor={isSelected ? theme.selectionBg : undefined}
            color={isSelected ? theme.selectionFg : theme.fg}
          >
            {isSelected ? icons.arrow : " "} {THEMES[name]?.label ?? name}
          </Text>
        );
      })}
      <Text color={theme.fgSubtle}>↑↓ preview · enter apply · esc cancel</Text>
    </Box>
  );
}
