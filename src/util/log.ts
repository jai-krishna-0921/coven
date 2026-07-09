import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const logDir = process.env["COVEN_LOG_DIR"] ?? join(homedir(), ".local", "share", "coven", "log");
let initialized = false;
let minLevel: LogLevel = (process.env["COVEN_LOG_LEVEL"] as LogLevel) ?? "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function write(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  if (!initialized) {
    mkdirSync(logDir, { recursive: true });
    initialized = true;
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, scope, message, ...data });
  try {
    appendFileSync(join(logDir, "coven.log"), line + "\n");
  } catch {
    // Logging must never take down the app.
  }
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => write("debug", scope, message, data),
    info: (message: string, data?: Record<string, unknown>) => write("info", scope, message, data),
    warn: (message: string, data?: Record<string, unknown>) => write("warn", scope, message, data),
    error: (message: string, data?: Record<string, unknown>) => write("error", scope, message, data),
  };
}
