export const LANG_STORAGE_KEY = "citedocs_lang";
export const LANG_MIGRATION_KEY = "citedocs_lang_migrated";

export interface MigrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * One-time migration: on app start, if the stored language key (localStorage)
 * is "en" and a migration marker is absent, reset it to "tr" and set the marker
 * so later deliberate choices of English via the user menu persist.
 *
 * Returns true if a reset from "en" to "tr" was performed, false otherwise.
 */
export function migrateLanguagePreference(
  storage?: MigrationStorage | null,
): boolean {
  const targetStorage =
    storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!targetStorage) return false;

  try {
    const storedLang = targetStorage.getItem(LANG_STORAGE_KEY);
    const marker = targetStorage.getItem(LANG_MIGRATION_KEY);

    if (storedLang === "en" && !marker) {
      targetStorage.setItem(LANG_STORAGE_KEY, "tr");
      targetStorage.setItem(LANG_MIGRATION_KEY, "true");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Persists a user's explicit language preference to storage and sets the
 * migration marker so deliberate choices are never reset by the one-time migration.
 */
export function persistLanguagePreference(
  lang: "tr" | "en",
  storage?: MigrationStorage | null,
): void {
  const targetStorage =
    storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!targetStorage) return;

  try {
    targetStorage.setItem(LANG_STORAGE_KEY, lang);
    targetStorage.setItem(LANG_MIGRATION_KEY, "true");
  } catch {
    // Gracefully handle storage quota or private-mode errors
  }
}
