/**
 * System clipboard writer — pipes text into whichever tool is available.
 * Fails silently returning `false` when nothing works (headless server, WSL
 * without wsl-clipboard, minimal container) so callers can toast a fallback
 * message rather than crash.
 *
 * Priority: pbcopy (macOS) → clip.exe (Windows) → wl-copy (Wayland) →
 * xclip (X11) → xsel (X11 alt).
 */
import { spawn } from "node:child_process";

const CANDIDATES: Array<{ cmd: string; args: string[]; platform?: NodeJS.Platform }> = [
  { cmd: "pbcopy", args: [], platform: "darwin" },
  { cmd: "clip", args: [], platform: "win32" },
  { cmd: "wl-copy", args: [] },
  { cmd: "xclip", args: ["-selection", "clipboard"] },
  { cmd: "xsel", args: ["--clipboard", "--input"] },
];

export async function copyToClipboard(text: string): Promise<boolean> {
  for (const c of CANDIDATES) {
    if (c.platform && c.platform !== process.platform) continue;
    try {
      const ok = await tryOne(c.cmd, c.args, text);
      if (ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function tryOne(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.end(text, "utf8");
  });
}
