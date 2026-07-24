/**
 * OAuth 2.0 authorization-code flow with PKCE + CSRF state + a local callback
 * HTTP server. Standalone — no dependency on the AuthStore — so both MCP
 * remote servers and provider BYOK ("sign in with browser") reuse it.
 *
 * Flow:
 *  1. Generate PKCE verifier + S256 challenge, generate CSRF state.
 *  2. Bind a local HTTP server on an ephemeral port; the redirect URI is
 *     `http://127.0.0.1:<port>/callback`.
 *  3. Open the auth URL in the user's browser (fall back to printing it).
 *  4. Wait for the /callback GET; verify state; extract `code`.
 *  5. Exchange the code for tokens at the token endpoint.
 *  6. Shut down the callback server and return the tokens.
 *
 * The refresh helper POSTs a refresh_token grant against the same token URL
 * and returns fresh tokens.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

export interface OAuthClient {
  /** Full URL to the authorization endpoint. */
  authorizationUrl: string;
  /** Full URL to the token endpoint. */
  tokenUrl: string;
  /** Preconfigured client id. Dynamic client registration is out of scope. */
  clientId: string;
  /** Optional confidential-client secret; omit for public clients. */
  clientSecret?: string;
  /** Space-delimited scope list to request. */
  scopes?: string[];
  /** Extra query params to append to the auth URL (audience, resource, etc.). */
  extraAuthParams?: Record<string, string>;
}

export interface OAuthTokens {
  access: string;
  refresh?: string;
  /** Epoch ms when `access` expires; undefined = no expiry advertised. */
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface OAuthFlowOptions {
  /** Ephemeral by default (0). Set for services that need a fixed callback URI. */
  callbackPort?: number;
  /** Overrides `authorize()`'s default (`open`/`xdg-open`/`start`). */
  openBrowser?: (url: string) => Promise<void> | void;
  /** Print the URL instead of opening it — handy for SSH sessions. */
  printOnly?: boolean;
  /** Overall timeout for the whole flow (default 5 min). */
  timeoutMs?: number;
  /** Written to stderr with the URL when auto-open fails. */
  logger?: (line: string) => void;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function generateState(): string {
  return base64url(randomBytes(16));
}

async function defaultOpenBrowser(url: string): Promise<void> {
  const commands: Array<{ cmd: string; args: string[] }> = [];
  if (process.platform === "darwin") commands.push({ cmd: "open", args: [url] });
  else if (process.platform === "win32") commands.push({ cmd: "cmd", args: ["/c", "start", "", url] });
  else commands.push({ cmd: "xdg-open", args: [url] });
  for (const { cmd, args } of commands) {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      child.unref();
      return;
    } catch {
      /* try next */
    }
  }
  throw new Error(`could not open browser (${process.platform})`);
}

async function exchangeCode(
  client: OAuthClient,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: client.clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (client.clientSecret) body.set("client_secret", client.clientSecret);
  return await postToken(client.tokenUrl, body);
}

async function postToken(tokenUrl: string, body: URLSearchParams): Promise<OAuthTokens> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OAuth token endpoint failed (HTTP ${response.status}): ${text}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OAuth token endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
  const parsed = json as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  if (typeof parsed.access_token !== "string") throw new Error(`OAuth token endpoint returned no access_token: ${text.slice(0, 200)}`);
  return {
    access: parsed.access_token,
    refresh: parsed.refresh_token,
    expiresAt: parsed.expires_in ? Date.now() + parsed.expires_in * 1000 : undefined,
    scope: parsed.scope,
    tokenType: parsed.token_type,
  };
}

/**
 * Run the full authorize → callback → exchange flow. Resolves with the
 * tokens; rejects on timeout, CSRF mismatch, or provider error.
 */
export async function performOAuthFlow(client: OAuthClient, opts: OAuthFlowOptions = {}): Promise<OAuthTokens> {
  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const log = opts.logger ?? ((line) => process.stderr.write(line + "\n"));

  const codePromise = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end("Not found");
        return;
      }
      const gotState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(400, { "content-type": "text/html" }).end(
          `<h1>Sign-in failed</h1><p>${escapeHtml(err)}: ${escapeHtml(url.searchParams.get("error_description") ?? "")}</p>`,
        );
        server.close();
        reject(new Error(`OAuth provider returned error: ${err}`));
        return;
      }
      if (!code) {
        res.writeHead(400, { "content-type": "text/plain" }).end("Missing ?code parameter");
        return;
      }
      if (gotState !== state) {
        res.writeHead(400, { "content-type": "text/plain" }).end("State mismatch — refusing to complete flow.");
        server.close();
        reject(new Error("OAuth state mismatch (possible CSRF); flow aborted."));
        return;
      }
      res.writeHead(200, { "content-type": "text/html" }).end(
        "<h1>Signed in.</h1><p>You can close this tab and return to the terminal.</p>",
      );
      server.close();
      resolve({ code, redirectUri: `http://127.0.0.1:${port}/callback` });
    });

    server.on("error", reject);
    server.listen(opts.callbackPort ?? 0, "127.0.0.1");
    const port = (server.address() as AddressInfo | null)?.port ?? 0;
    // Register the timeout AFTER the port is known so we can also close the server.
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("OAuth flow timed out waiting for the browser callback."));
    }, opts.timeoutMs ?? 300_000);
    server.on("close", () => clearTimeout(timeout));

    // Kick off the browser once the server is listening.
    server.on("listening", () => {
      const boundPort = (server.address() as AddressInfo | null)?.port;
      if (!boundPort) {
        reject(new Error("Could not bind local callback port."));
        return;
      }
      const redirectUri = `http://127.0.0.1:${boundPort}/callback`;
      const authUrl = buildAuthUrl(client, challenge, state, redirectUri, opts.callbackPort ? undefined : "S256");
      if (opts.printOnly) {
        log(`Open this URL in your browser to sign in:\n  ${authUrl}`);
        return;
      }
      const opener = opts.openBrowser ?? defaultOpenBrowser;
      Promise.resolve(opener(authUrl)).catch(() => {
        log(`Could not open browser automatically. Open this URL:\n  ${authUrl}`);
      });
    });
  });

  const { code, redirectUri } = await codePromise;
  return exchangeCode(client, code, verifier, redirectUri);
}

function buildAuthUrl(
  client: OAuthClient,
  challenge: string,
  state: string,
  redirectUri: string,
  _method?: string,
): string {
  const url = new URL(client.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (client.scopes && client.scopes.length > 0) url.searchParams.set("scope", client.scopes.join(" "));
  for (const [k, v] of Object.entries(client.extraAuthParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Exchange a refresh_token for a fresh access_token. Some providers rotate
 * the refresh token — if a new one is returned we surface it.
 */
export async function refreshOAuthToken(client: OAuthClient, refresh: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: client.clientId,
  });
  if (client.clientSecret) body.set("client_secret", client.clientSecret);
  const fresh = await postToken(client.tokenUrl, body);
  // Providers that don't rotate refresh tokens omit them from the response — keep the old one.
  return { ...fresh, refresh: fresh.refresh ?? refresh };
}
