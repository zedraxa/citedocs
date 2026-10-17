/** S3 user metadata travels in HTTP headers; encode user text as ASCII. */
export function encodeS3MetaValue(value: string): string {
  return encodeURIComponent(value);
}

/** Keep legacy unencoded metadata readable, including malformed percent escapes. */
export function decodeS3MetaValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
