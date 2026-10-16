import type { DocumentRole } from "./access.js";

export interface CollabUser {
  id: string;
  name: string;
  color?: string;
  role?: DocumentRole;
  avatar?: string;
}

/**
 * Parses authentication token from Hocuspocus onAuthenticate payload.
 *
 * Supported temporary dev stub token formats:
 * 1. JSON string: `{"userId":"user-1","name":"Alice","color":"#3b82f6"}`
 * 2. Delimited string: `"userId:name:color"` or `"userId:name"`
 * 3. Plain user ID: `"user-1"` or `"Bearer user-1"`
 *
 * Returns resolved CollabUser or null if token is missing or empty.
 */
export function parseCollabToken(token?: string): CollabUser | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const unwrapped = trimmed.startsWith("Bearer ")
    ? trimmed.slice(7).trim()
    : trimmed;

  if (!unwrapped) {
    return null;
  }

  // 1. JSON object payload
  if (unwrapped.startsWith("{") && unwrapped.endsWith("}")) {
    try {
      const parsed = JSON.parse(unwrapped);
      const id = parsed.userId || parsed.id || parsed.sub;
      if (!id) return null;
      return {
        id: String(id),
        name: parsed.name ? String(parsed.name) : String(id),
        color: parsed.color ? String(parsed.color) : undefined,
        role: parsed.role,
        avatar: parsed.avatar ? String(parsed.avatar) : undefined,
      };
    } catch {
      // Fall through to string parser
    }
  }

  // 2. Delimited format: id:name:color
  if (unwrapped.includes(":")) {
    const parts = unwrapped.split(":");
    const id = parts[0]?.trim();
    if (!id) return null;
    const name = parts[1]?.trim() || id;
    const color = parts[2]?.trim();
    return {
      id,
      name,
      color: color || undefined,
    };
  }

  // 3. Plain user ID
  return {
    id: unwrapped,
    name: unwrapped,
  };
}
