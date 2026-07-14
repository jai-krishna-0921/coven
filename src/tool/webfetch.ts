import { lookup } from "node:dns/promises";
import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** True for loopback / private / link-local / CGNAT / unique-local addresses. */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip; // IPv4-mapped IPv6
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v6 = addr.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true; // link-local / unique-local
  return false;
}

/** Reject hosts that resolve to a non-public address (SSRF guard). Throws on block. */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error(`refused: ${hostname} is a local address`);
  }
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) throw new Error(`refused: ${hostname} is a private/loopback address`);
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return; // can't resolve — let the real fetch fail normally
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error(`refused: ${hostname} resolves to a private address (${address})`);
  }
}

/** Read a response body up to a byte cap so a huge page can't OOM us. */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    out += decoder.decode(value, { stream: true });
    if (total >= MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return out;
}

/** Crude HTML→text: strips scripts/styles/tags, collapses whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webfetchTool = defineTool({
  id: "webfetch",
  description: "Fetch a URL and return its content as text (HTML is converted to plain text).",
  parameters: z.object({
    url: z.string().url().describe("URL to fetch (http/https only)"),
  }),
  async execute(args, ctx) {
    const url = new URL(args.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { title: args.url, output: "Error: only http/https URLs are allowed." };
    }
    await ctx.ask({ permission: "webfetch", patterns: [url.hostname], title: `Fetch ${args.url}` });

    // Follow redirects manually, re-validating every hop, so an approved public
    // host can't 30x-redirect into the cloud metadata endpoint or a LAN service.
    let current = args.url;
    let response: Response;
    try {
      for (let hop = 0; ; hop++) {
        const hopUrl = new URL(current);
        if (hopUrl.protocol !== "http:" && hopUrl.protocol !== "https:") {
          return { title: args.url, output: "Error: redirect to a non-http(s) URL was blocked." };
        }
        await assertPublicHost(hopUrl.hostname);
        response = await fetch(current, {
          signal: AbortSignal.any([ctx.abort, AbortSignal.timeout(30_000)]),
          headers: { "user-agent": "coven/0.1 (+https://github.com/jai-krishna-0921/coven)" },
          redirect: "manual",
        });
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          if (hop >= MAX_REDIRECTS) return { title: args.url, output: "Error: too many redirects." };
          current = new URL(location, current).href;
          continue;
        }
        break;
      }
    } catch (error) {
      return { title: args.url, output: String(error instanceof Error ? error.message : error), metadata: { isError: true } };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await readCapped(response);
    const text = contentType.includes("html") ? htmlToText(body) : body;
    return {
      title: `${url.hostname} (${response.status})`,
      output: truncateOutput(text),
      metadata: { status: response.status, contentType },
    };
  },
});
