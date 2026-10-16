/**
 * Redacts any occurrence of a secret API key and sensitive header values from a string.
 */
export function redactApiKey(text: string, apiKey?: string): string {
  if (!text) return text;
  let result = text;

  if (apiKey && apiKey.trim().length > 0) {
    result = result.split(apiKey).join("[REDACTED]");
  }

  // Redact header patterns (e.g. Zotero-API-Key: xyz)
  result = result.replace(/([zZ]otero-[aA][pP][iI]-[kK]ey[:=]\s*)([^\s,;&]+)/g, "$1[REDACTED]");

  // Redact URL query parameters (e.g. ?key=xyz or &key=xyz)
  result = result.replace(/([?&]key=)([^&\s]+)/g, "$1[REDACTED]");

  return result;
}

export interface ZoteroApiErrorOptions {
  statusCode?: number;
  responseBody?: string;
  apiKey?: string;
  backoffSeconds?: number;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/**
 * Standard error class for Zotero Web API v3 operations.
 * Automatically guarantees API keys are redacted from messages and error bodies.
 */
export class ZoteroApiError extends Error {
  public readonly statusCode?: number;
  public readonly responseBody?: string;
  public readonly backoffSeconds?: number;
  public readonly retryAfterSeconds?: number;
  public readonly isConflict: boolean;
  public readonly isRateLimited: boolean;

  constructor(message: string, options?: ZoteroApiErrorOptions) {
    const sanitizedMessage = redactApiKey(message, options?.apiKey);
    super(sanitizedMessage);
    this.name = "ZoteroApiError";
    this.statusCode = options?.statusCode;
    this.responseBody = options?.responseBody
      ? redactApiKey(options.responseBody, options?.apiKey)
      : undefined;
    this.backoffSeconds = options?.backoffSeconds;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.isConflict = options?.statusCode === 412;
    this.isRateLimited = options?.statusCode === 429;

    if (options?.cause) {
      if (options.cause instanceof Error) {
        options.cause.message = redactApiKey(options.cause.message, options?.apiKey);
      }
      this.cause = options.cause;
    }

    Object.setPrototypeOf(this, ZoteroApiError.prototype);
  }
}

/**
 * Thrown when an optimistic concurrency check fails (412 Precondition Failed).
 */
export class ZoteroVersionConflictError extends ZoteroApiError {
  constructor(
    message = "Zotero library version conflict: remote library has been modified concurrently (412 Precondition Failed)",
    options?: Omit<ZoteroApiErrorOptions, "statusCode">,
  ) {
    super(message, { ...options, statusCode: 412 });
    this.name = "ZoteroVersionConflictError";
    Object.setPrototypeOf(this, ZoteroVersionConflictError.prototype);
  }
}

/**
 * Thrown when rate limited or backoff limit exceeded.
 */
export class ZoteroRateLimitError extends ZoteroApiError {
  constructor(
    message = "Zotero rate limit or backoff exceeded",
    options?: ZoteroApiErrorOptions,
  ) {
    super(message, { ...options, statusCode: options?.statusCode ?? 429 });
    this.name = "ZoteroRateLimitError";
    Object.setPrototypeOf(this, ZoteroRateLimitError.prototype);
  }
}
