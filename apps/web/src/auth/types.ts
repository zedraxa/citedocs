export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface AuthProviders {
  google: boolean;
  orcid: boolean;
}

export type AuthLanguage = "tr" | "en";

export type AuthViewMode =
  | "login"
  | "signup"
  | "forgot-password"
  | "reset-password"
  | "verify-email";
