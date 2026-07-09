/**
 * Minimal YAML frontmatter parser — flat string/number/boolean keys only,
 * which is all agent and skill files need. No YAML dependency.
 */
export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

export function parseFrontmatter(text: string): Frontmatter {
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: text };
  const head = text.slice(3, end).trim();
  const body = text.slice(text.indexOf("\n", end + 1) + 1);
  const data: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, body };
}
