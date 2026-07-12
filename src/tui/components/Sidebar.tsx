/**
 * Right-hand sidebar panels. Two panels carry live data — Context usage and the
 * Modified Files list (hidden entirely when nothing changed). Todo / LSP / MCP
 * are placeholders that render a single dim "— later" line until wired up.
 */
import { Box, Text } from "ink";
import { useTheme, useUi } from "../context.tsx";
import type { ReactNode } from "react";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent} bold>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function Later() {
  const { theme } = useTheme();
  return (
    <Text color={theme.fgSubtle} dimColor>
      — later
    </Text>
  );
}

export function Sidebar() {
  const { theme, icons } = useTheme();
  const { context, changedFiles } = useUi();

  return (
    <Box flexDirection="column">
      <Panel title="Context">
        <Text color={theme.fgMuted}>
          {context.tokens} / {context.usable} ({context.pct}%)
        </Text>
      </Panel>

      {changedFiles.length > 0 ? (
        <Panel title="Modified Files">
          {changedFiles.map((file) => (
            <Text key={file} color={theme.fgMuted}>
              {icons.bullet} {file}
            </Text>
          ))}
        </Panel>
      ) : null}

      <Panel title="Todo">
        <Later />
      </Panel>
      <Panel title="LSP">
        <Later />
      </Panel>
      <Panel title="MCP">
        <Later />
      </Panel>
    </Box>
  );
}
