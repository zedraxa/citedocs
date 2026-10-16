import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { AuthUser, AuthProviders, AuthLanguage, AuthViewMode } from "./types.js";
import { authApi } from "./api.js";
import { getTranslation, type TranslationKey } from "./i18n.js";

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  providers: AuthProviders;
  lang: AuthLanguage;
  setLang: (lang: AuthLanguage) => void;
  t: (key: TranslationKey) => string;
  activeModal: AuthViewMode | null;
  openModal: (mode: AuthViewMode) => void;
  closeModal: () => void;
  login: (credentials: { email: string; password: string }) => Promise<AuthUser>;
  signup: (credentials: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<{ success: boolean; message: string }>;
  resendVerification: (email?: string) => Promise<{ success: boolean; message: string }>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (
    token: string,
    newPassword: string
  ) => Promise<{ success: boolean; message: string }>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  initialUser?: AuthUser | null;
  initialLang?: AuthLanguage;
  initialProviders?: AuthProviders;
  autoFetch?: boolean;
}

export function AuthProvider({
  children,
  initialUser = null,
  initialLang,
  initialProviders,
  autoFetch,
}: AuthProviderProps) {
  const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
  const shouldAutoFetch =
    autoFetch ??
    (!isTest || (typeof window !== "undefined" && window.location.pathname.startsWith("/login")));

  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [loading, setLoading] = useState(shouldAutoFetch && !initialUser);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AuthProviders>(
    initialProviders || {
      google: false,
      orcid: false,
    }
  );
  const [activeModal, setActiveModal] = useState<AuthViewMode | null>(null);

  const [lang, setLangState] = useState<AuthLanguage>(() => {
    if (initialLang) return initialLang;
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("citedocs_lang") as AuthLanguage | null;
      if (saved === "tr" || saved === "en") return saved;
    }
    if (typeof navigator !== "undefined" && navigator.language?.startsWith("tr")) {
      return "tr";
    }
    return "en";
  });

  const setLang = useCallback((newLang: AuthLanguage) => {
    setLangState(newLang);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("citedocs_lang", newLang);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey) => getTranslation(lang, key),
    [lang]
  );

  const clearError = useCallback(() => setError(null), []);

  const refreshSession = useCallback(async () => {
    try {
      const data = await authApi.getSession();
      setUser(data.user);
      setError(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: fetch providers & active session when autoFetch is enabled
  useEffect(() => {
    if (!shouldAutoFetch) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function init() {
      try {
        const [providersData] = await Promise.all([
          authApi.getProviders(),
          authApi.fetchCsrf().catch(() => ""),
        ]);
        if (isMounted) {
          setProviders(providersData);
        }
      } catch {
        // Fallback gracefully
      }

      try {
        const sessionData = await authApi.getSession();
        if (isMounted) {
          setUser(sessionData.user);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [shouldAutoFetch]);

  const login = useCallback(
    async (credentials: { email: string; password: string }): Promise<AuthUser> => {
      setError(null);
      try {
        const data = await authApi.login(credentials);
        setUser(data.user);
        setActiveModal(null);
        return data.user;
      } catch (err: unknown) {
        const msg = (err as Error).message || "Login failed";
        setError(msg);
        throw err;
      }
    },
    []
  );

  const signup = useCallback(
    async (credentials: {
      email: string;
      password: string;
      displayName?: string;
    }): Promise<AuthUser> => {
      setError(null);
      try {
        const data = await authApi.signup(credentials);
        setUser(data.user);
        setActiveModal(null);
        return data.user;
      } catch (err: unknown) {
        const msg = (err as Error).message || "Signup failed";
        setError(msg);
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setActiveModal(null);
    }
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    setError(null);
    try {
      const res = await authApi.verifyEmail(token);
      if (res.user) {
        setUser(res.user);
      } else {
        await refreshSession().catch(() => {});
      }
      return res;
    } catch (err: unknown) {
      const msg = (err as Error).message || "Verification failed";
      setError(msg);
      throw err;
    }
  }, [refreshSession]);

  const resendVerification = useCallback(async (email?: string) => {
    setError(null);
    try {
      const targetEmail = email || user?.email;
      return await authApi.resendVerification(targetEmail);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Resending verification failed";
      setError(msg);
      throw err;
    }
  }, [user]);

  const forgotPassword = useCallback(async (email: string) => {
    setError(null);
    try {
      return await authApi.forgotPassword(email);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Password reset request failed";
      setError(msg);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    setError(null);
    try {
      return await authApi.resetPassword(token, newPassword);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Password reset failed";
      setError(msg);
      throw err;
    }
  }, []);

  const openModal = useCallback((mode: AuthViewMode) => {
    setError(null);
    setActiveModal(mode);
  }, []);

  const closeModal = useCallback(() => {
    setError(null);
    setActiveModal(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    providers,
    lang,
    setLang,
    t,
    activeModal,
    openModal,
    closeModal,
    login,
    signup,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    refreshSession,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/** Like useAuth, but returns null outside an AuthProvider (used by embeddable components). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext) ?? null;
}
