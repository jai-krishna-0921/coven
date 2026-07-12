/**
 * A single bordered notice row, colored by kind. Used for the connector/setup
 * hint (App renders it when `!state.connectorReady`) and other transient notes.
 */
import { Box, Text } from "ink";
import { useTheme } from "../context.tsx";
import type { ToastKind } from "../types.ts";

function styleFor(kind: ToastKind, theme: ReturnType<typeof useTheme>["theme"], icons: ReturnType<typeof useTheme>["icons"]) {
  switch (kind) {
    case "success":
      return { color: theme.success, glyph: icons.ok };
    case "warn":
      return { color: theme.warning, glyph: icons.warn };
    case "error":
      return { color: theme.error, glyph: icons.err };
    default:
      return { color: theme.info, glyph: icons.info };
  }
}

export function Banner({ text, kind }: { text: string; kind: ToastKind }) {
  const { theme, icons, borders } = useTheme();
  const { color, glyph } = styleFor(kind, theme, icons);

  return (
    <Box
      borderStyle={borders as "round" | "classic"}
      borderColor={color}
      paddingX={1}
    >
      <Text color={color}>
        {glyph} {text}
      </Text>
    </Box>
  );
}
