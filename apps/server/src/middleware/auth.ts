import { type FastifyRequest, type FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * TEMPORARY AUTHENTICATION STUB (Milestone 2):
 * In M2, we read the `X-User-Id` HTTP header to determine the requesting student identity.
 * In M3, this stub will be replaced with Argon2id password / OAuth 2.0 session tokens
 * and HTTP-only signed cookies.
 *
 * This preHandler hook enforces that an authenticated user ID is present on protected routes.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userIdHeader = request.headers["x-user-id"];

  if (!userIdHeader || typeof userIdHeader !== "string" || userIdHeader.trim() === "") {
    reply.status(401).send({
      error: "Unauthorized",
      message: "Missing or invalid X-User-Id authentication header (temporary M2 auth stub)",
    });
    return;
  }

  request.userId = userIdHeader.trim();
}
