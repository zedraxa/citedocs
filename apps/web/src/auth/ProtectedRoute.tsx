import { type ReactNode } from "react";
import { useAuth } from "./AuthContext.js";
import { LoginPage } from "./LoginPage.js";

export interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  allowGuest?: boolean;
}

export function ProtectedRoute({
  children,
  fallback,
  allowGuest = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, loading, t } = useAuth();

  if (loading) {
    return (
      <div
        data-testid="auth-loading-spinner"
        className="flex items-center justify-center min-h-[50vh] p-8"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-gray-500">
            {t("submitting")}
          </span>
        </div>
      </div>
    );
  }

  if (isAuthenticated || allowGuest) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 flex flex-col justify-center">
      <div className="mb-4 max-w-md mx-auto text-center">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-xs font-medium">
          {t("loginRequiredNotice")}
        </div>
      </div>
      <LoginPage standalone={false} />
    </div>
  );
}
