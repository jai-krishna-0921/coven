/** Minimal ANSI styling — no dependency needed for a handful of escape codes. */
const enabled = process.stdout.isTTY && process.env["NO_COLOR"] === undefined;

function style(open: number, close: number) {
  return (text: string): string => (enabled ? `[${open}m${text}[${close}m` : text);
}

export const bold = style(1, 22);
export const dim = style(2, 22);
export const italic = style(3, 23);
export const underline = style(4, 24);
export const red = style(31, 39);
export const green = style(32, 39);
export const yellow = style(33, 39);
export const blue = style(34, 39);
export const magenta = style(35, 39);
export const cyan = style(36, 39);
export const gray = style(90, 39);

export const CLEAR_LINE = "[2K\r";
