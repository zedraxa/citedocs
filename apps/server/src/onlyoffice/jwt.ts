import crypto from "node:crypto";

/** Minimal HS256 JWT helpers for the ONLYOFFICE Document Server integration. */
const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export function getOnlyofficeSecret(): string {
  const s = process.env.ONLYOFFICE_JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("ONLYOFFICE_JWT_SECRET is not set");
  return "citedocs-onlyoffice-dev-secret";
}

export function signJwt(payload: object, secret = getOnlyofficeSecret()): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64(JSON.stringify(payload));
  return head + "." + crypto.createHmac("sha256", secret).update(head).digest("base64url");
}

export function verifyJwt<T = Record<string, unknown>>(token: string | undefined, secret = getOnlyofficeSecret()): T | null {
  if (!token) return null;
  const [a, b, c] = token.split(".");
  if (!a || !b || !c) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${a}.${b}`).digest("base64url");
  if (expected.length !== c.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8")) as T & { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Short HMAC binding a file id (and opener) to a storage/callback URL. */
export function signLink(parts: string[], secret = getOnlyofficeSecret()): string {
  return crypto.createHmac("sha256", secret).update("oo-link:" + parts.join("|")).digest("base64url").slice(0, 32);
}

export function verifyLink(sig: string | undefined, parts: string[]): boolean {
  if (!sig) return false;
  const exp = signLink(parts);
  return exp.length === sig.length && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig));
}
