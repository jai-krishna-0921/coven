import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";

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

    const response = await fetch(args.url, {
      signal: AbortSignal.any([ctx.abort, AbortSignal.timeout(30_000)]),
      headers: { "user-agent": "coven/0.1 (+https://github.com/jai-krishna-0921/coven)" },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const text = contentType.includes("html") ? htmlToText(body) : body;
    return {
      title: `${url.hostname} (${response.status})`,
      output: truncateOutput(text),
      metadata: { status: response.status, contentType },
    };
  },
});
