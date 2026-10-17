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
  const head =
    b64(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64(JSON.stringify(payload));
  return head + "." + crypto.createHmac("sha256", secret).update(head).digest("base64url");
}

export function verifyJwt<T = Record<string, unknown>>(
  token: string | undefined,
  secret = getOnlyofficeSecret(),
): T | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [a, b, c] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${a}.${b}`).digest("base64url");
  if (
    expected.length !== c.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))
  )
    return null;
  try {
    const header = JSON.parse(Buffer.from(a, "base64url").toString("utf8"));
    if (header?.alg !== "HS256") return null;
    const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const now = Date.now() / 1000;
    if (payload.exp !== undefined && (typeof payload.exp !== "number" || payload.exp <= now))
      return null;
    if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > now))
      return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** Short HMAC binding a file id (and opener) to a storage/callback URL. */
export function signLink(parts: string[], secret = getOnlyofficeSecret()): string {
  return crypto
    .createHmac("sha256", secret)
    .update("oo-link:" + JSON.stringify(parts))
    .digest("base64url")
    .slice(0, 32);
}

export function verifyLink(sig: string | undefined, parts: string[], secret = getOnlyofficeSecret()): boolean {
  if (!sig) return false;
  const exp = signLink(parts, secret);
  const bExp = Buffer.from(exp);
  const bSig = Buffer.from(sig);
  return bExp.length === bSig.length && crypto.timingSafeEqual(bExp, bSig);
}
