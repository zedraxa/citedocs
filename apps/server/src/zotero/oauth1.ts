import crypto from "node:crypto";

/**
 * Real Zotero OAuth 1.0a (HMAC-SHA1) client.
 * Requires an app registered at https://www.zotero.org/oauth/apps
 * (env ZOTERO_OAUTH_CLIENT_KEY / ZOTERO_OAUTH_CLIENT_SECRET).
 * The access-token response's oauth_token_secret is the user's Zotero API key.
 */
const BASE = "https://www.zotero.org/oauth";
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function zoteroOAuthConfigured(): boolean {
  return Boolean(process.env.ZOTERO_OAUTH_CLIENT_KEY && process.env.ZOTERO_OAUTH_CLIENT_SECRET);
}

function authHeader(url: string, extra: Record<string, string>, tokenSecret = ""): string {
  const key = process.env.ZOTERO_OAUTH_CLIENT_KEY || "";
  const secret = process.env.ZOTERO_OAUTH_CLIENT_SECRET || "";
  const params: Record<string, string> = {
    oauth_consumer_key: key,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...extra,
  };
  const norm = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k]!)}`).join("&");
  const base = ["POST", enc(url), enc(norm)].join("&");
  params.oauth_signature = crypto.createHmac("sha1", `${enc(secret)}&${enc(tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.keys(params).map((k) => `${enc(k)}="${enc(params[k]!)}"`).join(", ");
}

interface Pending { userId: string; secret: string; returnTo: string; at: number }
const pending = new Map<string, Pending>();

export async function startZoteroOAuth(userId: string, callbackUrl: string, returnTo: string, fetchFn = fetch) {
  const url = `${BASE}/request`;
  const res = await fetchFn(url, { method: "POST", headers: { Authorization: authHeader(url, { oauth_callback: callbackUrl }) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zotero request token failed (${res.status})`);
  const p = new URLSearchParams(text);
  const token = p.get("oauth_token");
  const secret = p.get("oauth_token_secret");
  if (!token || !secret) throw new Error("Zotero request token response incomplete");
  for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60e3) pending.delete(k);
  pending.set(token, { userId, secret, returnTo, at: Date.now() });
  const q = new URLSearchParams({ oauth_token: token, library_access: "1", notes_access: "1", write_access: "1", all_groups: "write", name: "CiteDocs" });
  return `${BASE}/authorize?${q.toString()}`;
}

export async function finishZoteroOAuth(userId: string, token: string, verifier: string, fetchFn = fetch) {
  const p = pending.get(token);
  if (!p || p.userId !== userId) throw new Error("Unknown or expired OAuth request");
  pending.delete(token);
  const url = `${BASE}/access`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { Authorization: authHeader(url, { oauth_token: token, oauth_verifier: verifier }, p.secret) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zotero access token failed (${res.status})`);
  const r = new URLSearchParams(text);
  const apiKey = r.get("oauth_token_secret");
  if (!apiKey) throw new Error("Zotero did not return an API key");
  return { apiKey, zoteroUserId: r.get("userID"), username: r.get("username"), returnTo: p.returnTo };
}
