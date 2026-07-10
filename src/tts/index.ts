/**
 * Text-to-speech. Zero-dependency system backends (say / piper / spd-say /
 * espeak / PowerShell SAPI) with an OpenAI premium backend when a key and an
 * audio player are available. Sentence-chunked queue, one utterance at a
 * time, kill-on-interrupt.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createLogger } from "../util/log.ts";

const log = createLogger("tts");

export type TtsBackend = "openai" | "say" | "piper" | "spd" | "espeak" | "powershell";

export interface TtsConfig {
  /** "off" disables; a backend name forces it (falls through when unavailable). */
  backend?: string;
  /** Voice name for system backends (say -v …). */
  voice?: string;
  /** Speech rate (say -r words/min; espeak -s). */
  rate?: number;
  openaiVoice?: string;
  openaiModel?: string;
}

export interface TtsDeps {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  hasBin?: (name: string) => boolean;
}

const CHUNK_MAX = 400;
const CHUNK_MERGE_MIN = 40;

/** Strip markdown to speakable text: code fences dropped, symbols removed. */
export function stripForSpeech(markdown: string): string {
  let text = markdown;
  text = text.replace(/```[\s\S]*?```/g, " "); // closed fences
  text = text.replace(/```[\s\S]*$/g, " "); // unclosed trailing fence
  text = text.replace(/`([^`]*)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // images → alt
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links → text
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/(\*\*|__)([^*_]+)\1/g, "$2");
  text = text.replace(/(?<![\w])[*_]([^*_]+)[*_](?![\w])/g, "$1");
  return text.replace(/\s+/g, " ").trim();
}

/** Sentence-boundary chunking: merge short fragments, cap chunks at 400 chars. */
export function chunkSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const sentences = flat.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [flat];

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > CHUNK_MAX) {
      flush();
      // Hard-slice oversized spans (huge words/URLs) — no separators added.
      for (let i = 0; i < sentence.length; i += CHUNK_MAX) {
        chunks.push(sentence.slice(i, i + CHUNK_MAX));
      }
      continue;
    }
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= CHUNK_MAX && (current.length < CHUNK_MERGE_MIN || sentence.length < CHUNK_MERGE_MIN || current.length + 1 + sentence.length <= CHUNK_MAX)) {
      current = `${current} ${sentence}`;
    } else {
      flush();
      current = sentence;
    }
  }
  flush();
  return chunks;
}

function defaultHasBin(platform: NodeJS.Platform, env: Record<string, string | undefined>): (name: string) => boolean {
  const dirs = (env["PATH"] ?? "").split(delimiter).filter(Boolean);
  return (name: string) => {
    const file = platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : name;
    return dirs.some((dir) => {
      try {
        return existsSync(join(dir, file));
      } catch {
        return false;
      }
    });
  };
}

function playerFor(platform: NodeJS.Platform, hasBin: (name: string) => boolean): string | undefined {
  if (platform === "win32") return "powershell";
  const players = platform === "darwin" ? ["afplay", "ffplay", "mpv"] : ["ffplay", "mpv", "aplay"];
  return players.find((player) => hasBin(player));
}

function backendAvailable(
  backend: string,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  hasBin: (name: string) => boolean,
): TtsBackend | undefined {
  switch (backend) {
    case "openai":
      return env["OPENAI_API_KEY"] && playerFor(platform, hasBin) ? "openai" : undefined;
    case "say":
      return hasBin("say") ? "say" : undefined;
    case "piper":
      return hasBin("piper") && env["PIPER_MODEL"] && hasBin("aplay") ? "piper" : undefined;
    case "spd":
      return hasBin("spd-say") ? "spd" : undefined;
    case "espeak":
      return hasBin("espeak-ng") || hasBin("espeak") ? "espeak" : undefined;
    case "powershell":
      return platform === "win32" ? "powershell" : undefined;
    default:
      return undefined;
  }
}

export function detectBackend(config: TtsConfig, deps?: TtsDeps): TtsBackend | null {
  const platform = deps?.platform ?? process.platform;
  const env = deps?.env ?? (process.env as Record<string, string | undefined>);
  const hasBin = deps?.hasBin ?? defaultHasBin(platform, env);

  // Explicit overrides: config first, then COVEN_TTS. "off" disables; a named
  // backend is used when available, otherwise detection falls through.
  for (const override of [config.backend, env["COVEN_TTS"]]) {
    if (!override || override === "auto") continue;
    if (override === "off") return null;
    const forced = backendAvailable(override, platform, env, hasBin);
    if (forced) return forced;
  }

  const openai = backendAvailable("openai", platform, env, hasBin);
  if (openai) return openai;
  if (platform === "darwin" && hasBin("say")) return "say";
  if (platform === "win32") return "powershell";
  for (const candidate of ["piper", "spd", "espeak"] as const) {
    const found = backendAvailable(candidate, platform, env, hasBin);
    if (found) return found;
  }
  return null;
}

export class Tts {
  readonly backend: TtsBackend | null;
  enabled = false;

  private queue: string[] = [];
  private pumping = false;
  private current: ChildProcess | undefined;
  private fetchAbort: AbortController | undefined;
  private config: TtsConfig;
  private env: Record<string, string | undefined>;
  private platform: NodeJS.Platform;
  private hasBin: (name: string) => boolean;

  constructor(config: TtsConfig = {}, deps?: TtsDeps) {
    this.config = config;
    this.platform = deps?.platform ?? process.platform;
    this.env = deps?.env ?? (process.env as Record<string, string | undefined>);
    this.hasBin = deps?.hasBin ?? defaultHasBin(this.platform, this.env);
    this.backend = detectBackend(config, { platform: this.platform, env: this.env, hasBin: this.hasBin });
  }

  status(): string {
    if (!this.backend) return "unavailable — no TTS backend found";
    return this.enabled ? `on (${this.backend})` : `off (backend: ${this.backend} available)`;
  }

  speak(text: string): void {
    if (!this.enabled || !this.backend) return;
    try {
      const chunks = chunkSentences(stripForSpeech(text));
      if (chunks.length === 0) return;
      this.queue.push(...chunks);
      void this.pump();
    } catch (error) {
      log.warn("speak failed", { error: String(error) });
    }
  }

  stop(): void {
    try {
      this.queue.length = 0;
      this.fetchAbort?.abort();
      if (this.current) {
        const child = this.current;
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Already gone.
          }
        }, 200).unref?.();
        this.current = undefined;
      }
      // speech-dispatcher plays through a daemon — killing the client is not enough.
      if (this.backend === "spd") spawn("spd-say", ["-C"], { stdio: "ignore" }).on("error", () => {});
    } catch (error) {
      log.warn("stop failed", { error: String(error) });
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const chunk = this.queue.shift()!;
        try {
          await this.speakChunk(chunk);
        } catch (error) {
          log.warn("utterance failed", { backend: this.backend, error: String(error) });
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private waitForClose(child: ChildProcess): Promise<void> {
    this.current = child;
    return new Promise((resolve) => {
      child.on("error", () => resolve());
      child.on("close", () => {
        if (this.current === child) this.current = undefined;
        resolve();
      });
    });
  }

  private speakViaStdin(command: string, args: string[], text: string): Promise<void> {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.stdin?.write(text);
    child.stdin?.end();
    return this.waitForClose(child);
  }

  private async speakChunk(text: string): Promise<void> {
    switch (this.backend) {
      case "say": {
        const args: string[] = [];
        if (this.config.voice) args.push("-v", this.config.voice);
        if (this.config.rate) args.push("-r", String(this.config.rate));
        return this.speakViaStdin("say", args, text);
      }
      case "espeak": {
        const bin = this.hasBin("espeak-ng") ? "espeak-ng" : "espeak";
        const args: string[] = ["-s", String(this.config.rate ?? 175)];
        if (this.config.voice) args.push("-v", this.config.voice);
        return this.speakViaStdin(bin, args, text);
      }
      case "spd": {
        const args = ["-w"];
        if (this.config.rate) args.push("-r", String(this.config.rate));
        args.push(text);
        const child = spawn("spd-say", args, { stdio: "ignore" });
        return this.waitForClose(child);
      }
      case "piper": {
        const model = this.env["PIPER_MODEL"]!;
        const piper = spawn("piper", ["--model", model, "--output-raw"], { stdio: ["pipe", "pipe", "ignore"] });
        const player = spawn("aplay", ["-q", "-r", "22050", "-f", "S16_LE", "-t", "raw", "-"], {
          stdio: ["pipe", "ignore", "ignore"],
        });
        piper.stdout.pipe(player.stdin!);
        piper.stdin?.write(text);
        piper.stdin?.end();
        this.current = piper;
        await new Promise<void>((resolve) => player.on("close", () => resolve()).on("error", () => resolve()));
        this.current = undefined;
        return;
      }
      case "powershell": {
        return this.speakViaStdin("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak([Console]::In.ReadToEnd())",
        ], text);
      }
      case "openai":
        return this.speakOpenai(text);
      default:
        return;
    }
  }

  private async speakOpenai(text: string): Promise<void> {
    this.fetchAbort = new AbortController();
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.env["OPENAI_API_KEY"]}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.openaiModel ?? "gpt-4o-mini-tts",
        input: text,
        voice: this.config.openaiVoice ?? "nova",
        response_format: "wav",
      }),
      signal: AbortSignal.any([this.fetchAbort.signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) throw new Error(`openai tts: HTTP ${response.status}`);
    const audio = Buffer.from(await response.arrayBuffer());
    const file = join(tmpdir(), `coven-tts-${process.pid}-${Date.now().toString(36)}.wav`);
    writeFileSync(file, audio);
    try {
      const player = playerFor(this.platform, this.hasBin);
      if (player === "afplay") await this.waitForClose(spawn("afplay", [file], { stdio: "ignore" }));
      else if (player === "ffplay")
        await this.waitForClose(spawn("ffplay", ["-autoexit", "-nodisp", "-loglevel", "quiet", file], { stdio: "ignore" }));
      else if (player === "mpv") await this.waitForClose(spawn("mpv", ["--really-quiet", "--no-video", file], { stdio: "ignore" }));
      else if (player === "aplay") await this.waitForClose(spawn("aplay", ["-q", file], { stdio: "ignore" }));
      else if (player === "powershell")
        await this.waitForClose(
          spawn("powershell.exe", ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${file}').PlaySync()`], {
            stdio: "ignore",
          }),
        );
    } finally {
      try {
        unlinkSync(file);
      } catch {
        // Temp file cleanup is best-effort.
      }
    }
  }
}
