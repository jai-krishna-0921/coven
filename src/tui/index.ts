/**
 * The Coven terminal entry point.
 *
 * `runTui(app)` mounts the full-screen Ink {@link AppRoot} when both stdout and
 * stdin are TTYs, and otherwise falls back to the plain line-oriented
 * {@link runFallbackRepl} (piped stdin / CI / dumb terminals). It never
 * `process.exit`s while Ink is mounted — the alt-screen restore must run — and
 * never disposes `app` itself (the CLI entry in `src/index.ts` owns
 * `app.dispose()`). The TTY/mount/fallback seams are injectable so the routing is
 * unit-testable without a real terminal.
 */
import { createElement } from "react";
import { render } from "ink";
import type { App } from "../app.ts";
import { App as AppRoot } from "./app.tsx";
import { runFallbackRepl } from "./fallback.ts";

/** Injectable seams so `runTui`'s routing is testable without a real terminal. */
export interface RunTuiDeps {
  /** Force the TTY decision (defaults to `stdout.isTTY && stdin.isTTY`). */
  isTTY?: boolean;
  /** Override the non-TTY branch (defaults to {@link runFallbackRepl}). */
  fallback?: (app: App) => Promise<void>;
  /** Override the Ink mount branch (defaults to {@link mountInk}). */
  mount?: (app: App) => Promise<void>;
}

/** Mount the full-screen Ink app in the alternate screen; unmount before rethrow. */
async function mountInk(app: App): Promise<void> {
  const instance = render(createElement(AppRoot, { app }), { alternateScreen: true, exitOnCtrlC: false });
  try {
    await instance.waitUntilExit();
  } catch (error) {
    instance.unmount(); // never leave the alt screen mounted on a crash
    throw error;
  }
}

/**
 * Launch the interactive UI. Mounts Ink on a real TTY, else runs the plain-text
 * fallback REPL. Resolves when the UI exits; the caller disposes `app`.
 */
export async function runTui(app: App, deps: RunTuiDeps = {}): Promise<void> {
  const interactive = deps.isTTY ?? Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const fallback = deps.fallback ?? runFallbackRepl;
  const mount = deps.mount ?? mountInk;
  if (!interactive) {
    await fallback(app);
    return;
  }
  await mount(app);
}
