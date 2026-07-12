/**
 * Bottom status bar: help hint · context usage · session cost · diagnostics ·
 * short model. Context percentage is colored by pressure via {@link pctColor}
 * (>=95 error, >=80 warning, else muted). Cost renders as `$0.00`.
 */
import { Box, Text } from "ink";
import { useTheme, useUi } from "../context.tsx";
import type { Theme } from "../theme.ts";

/** Color token for a context-usage percentage, by pressure. */
export function pctColor(pct: number, theme: Theme): string {
  if (pct >= 95) return theme.error;
  if (pct >= 80) return theme.warning;
  return theme.fgMuted;
}

/** The display model: the part after the last `/`, or `default` when unset. */
function modelShort(model: string | undefined): string {
  if (!model) return "default";
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}

function Sep() {
  const { theme } = useTheme();
  return <Text color={theme.fgSubtle}> │ </Text>;
}

export function Footer() {
  const { theme, icons } = useTheme();
  const { session, context } = useUi();
  const cost = session.cost ?? 0;

  return (
    <Box>
      <Text color={theme.fgMuted}>? help</Text>
      <Sep />
      <Text color={theme.fgMuted}>
        {icons.context} {context.tokens} (
        <Text color={pctColor(context.pct, theme)}>{context.pct}%</Text>)
      </Text>
      <Sep />
      <Text color={theme.fgMuted}>${cost.toFixed(2)}</Text>
      <Sep />
      <Text color={theme.toolOk}>
        {icons.ok} no diagnostics
      </Text>
      <Sep />
      <Text color={theme.fgMuted}>{modelShort(session.model)}</Text>
    </Box>
  );
}
