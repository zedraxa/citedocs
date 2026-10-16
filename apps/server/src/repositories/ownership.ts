import { OwnershipError } from "./errors.js";

/**
 * Validates that the resource's owner matches the requesting user ID.
 * Rejects cross-user access by throwing an OwnershipError.
 *
 * @param resourceOwnerUserId The owner_user_id of the entity in the database
 * @param currentUserId The user ID requesting the operation
 * @param resourceName Optional label for clearer error diagnostics
 */
export function assertOwnership(
  resourceOwnerUserId: string | null | undefined,
  currentUserId: string,
  resourceName = "Resource"
): void {
  if (!currentUserId) {
    throw new OwnershipError("Unauthenticated: valid user ID is required");
  }

  if (resourceOwnerUserId && resourceOwnerUserId !== currentUserId) {
    throw new OwnershipError(`Access denied: ${resourceName} belongs to another user`);
  }
}

/**
 * Validates document access, permitting access if the user is the owner
 * or holds an explicit share grant with the required permission role.
 */
export function checkDocumentPermission(
  ownerUserId: string,
  currentUserId: string,
  shareRole?: string | null,
  requiredRole: "read" | "write" | "admin" = "read"
): boolean {
  if (ownerUserId === currentUserId) {
    return true;
  }

  if (!shareRole) {
    return false;
  }

  if (requiredRole === "read") {
    return ["owner", "editor", "commenter", "viewer"].includes(shareRole);
  }

  if (requiredRole === "write") {
    return ["owner", "editor"].includes(shareRole);
  }

  if (requiredRole === "admin") {
    return ["owner"].includes(shareRole);
  }

  return false;
}
