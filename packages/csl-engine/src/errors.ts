export class UnknownStyleError extends Error {
  public readonly code = "UNKNOWN_STYLE" as const;
  public readonly styleId: string;

  constructor(styleId: string, message?: string) {
    super(message ?? `Unknown or unsupported CSL style: "${styleId}"`);
    this.name = "UnknownStyleError";
    this.styleId = styleId;
    Object.setPrototypeOf(this, UnknownStyleError.prototype);
  }
}

export class UnknownLocaleError extends Error {
  public readonly code = "UNKNOWN_LOCALE" as const;
  public readonly localeId: string;

  constructor(localeId: string, message?: string) {
    super(message ?? `Unknown or unsupported CSL locale: "${localeId}"`);
    this.name = "UnknownLocaleError";
    this.localeId = localeId;
    Object.setPrototypeOf(this, UnknownLocaleError.prototype);
  }
}

export class CSLEngineError extends Error {
  public readonly code = "CSL_ENGINE_ERROR" as const;

  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CSLEngineError";
    Object.setPrototypeOf(this, CSLEngineError.prototype);
  }
}
