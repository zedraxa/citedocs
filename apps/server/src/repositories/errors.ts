/**
 * Thrown when a user attempts to access, mutate, or delete a resource
 * that belongs to another user without explicit permission.
 */
export class OwnershipError extends Error {
  readonly statusCode = 403;

  constructor(message = "Access denied: resource belongs to another user") {
    super(message);
    this.name = "OwnershipError";
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
