import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcrypt with 10 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  return bcrypt.compare(password, hash);
}
