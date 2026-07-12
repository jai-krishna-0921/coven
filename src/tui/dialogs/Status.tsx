/**
 * Status dialog (§12): a read-only panel summarising the active session and
 * environment. Session/agent/model/context/cost come from {@link useUi}; the TTS
 * line from `app.tts?.status()` and the connectors line from `app.auth?.entries()`
 * — both optional App members, guarded with `?.` (degrade to "unavailable"/"none").
 * esc (or enter) closes.
 */
import { Box, Text, useInput } from "ink";
import type { ReactNode } from "react";
import { useTheme, useUi } from "../context.tsx";
import type { CommandContext } from "../types.ts";

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  const { theme } = useTheme();
  return (
    <Text>
      <Text color={theme.fgSubtle}>{label.padEnd(11)}</Text>
      <Text color={valueColor}>{value}</Text>
    </Text>
  );
}

export function Status({ ctx }: { ctx: CommandContext }) {
  const { theme, borders } = useTheme();
  const state = useUi();
  const session = state.session;

  useInput((_input, key) => {
    if (key.escape || key.return) ctx.closeModal();
  });

  const model = session.model ?? ctx.app.loaded?.config?.model ?? "—";
  const cost = session.cost ?? 0;
  const tts = ctx.app.tts?.status() ?? "unavailable";
  const entries = ctx.app.auth?.entries() ?? [];
  const connectors = entries.length > 0 ? entries.map((e) => `${e.provider} (${e.source})`).join(", ") : "none";

  const rows: ReactNode[] = [
    <Row key="session" label="session" value={`${session.title}  ${session.id}`} valueColor={theme.fg} />,
    <Row key="agent" label="agent" value={session.agent} valueColor={theme.agent} />,
    <Row key="model" label="model" value={model} valueColor={theme.fg} />,
    <Row
      key="context"
      label="context"
      value={`${state.context.pct}%  (${state.context.tokens}/${state.context.usable})`}
      valueColor={theme.fgMuted}
    />,
    <Row key="cost" label="cost" value={`$${cost.toFixed(2)}`} valueColor={theme.fgMuted} />,
    <Row key="tts" label="tts" value={tts} valueColor={theme.fgMuted} />,
    <Row key="connectors" label="connectors" value={connectors} valueColor={theme.fgMuted} />,
  ];

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} backgroundColor={theme.bgPanel} paddingX={1}>
      <Text color={theme.accent} bold>
        Status
      </Text>
      {rows}
      <Text color={theme.fgSubtle}>esc close</Text>
    </Box>
  );
}
