/**
 * Dependency-free spinner: cycles the active icon set's spinner frames on an
 * 80 ms timer. The interval is unref'd so it never keeps the process alive.
 */
import { useEffect, useState } from "react";
import { Text } from "ink";
import { useTheme } from "../context.tsx";

const FRAME_MS = 80;

export function Spinner({ label }: { label?: string }) {
  const { theme, icons } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % icons.spinner.length);
    }, FRAME_MS);
    timer.unref?.();
    return () => clearInterval(timer);
  }, [icons.spinner.length]);

  const glyph = icons.spinner[frame % icons.spinner.length] ?? "";
  return (
    <Text color={theme.accent}>
      {glyph}
      {label ? ` ${label}` : ""}
    </Text>
  );
}
