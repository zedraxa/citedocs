import { useAuth } from "./AuthContext.js";
import { getApiBaseUrl } from "./api.js";

export function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function OrcidIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256">
      <circle cx="128" cy="128" r="128" fill="#A6CE39" />
      <path
        fill="#FFFFFF"
        d="M86.3 186.2H70.9V79.1h15.4v107.1zM78.6 65.4c-5.5 0-9.9-4.5-9.9-9.9s4.4-9.9 9.9-9.9 9.9 4.4 9.9 9.9-4.4 9.9-9.9 9.9zM108.9 79.1h41.6c39.6 0 57.1 28.3 57.1 53.5 0 27.5-20 53.6-56.8 53.6h-41.9V79.1zm15.4 92.5h24.7c27.5 0 41.4-16.7 41.4-38.9 0-21.7-13.7-39-41.4-39h-24.7v77.9z"
      />
    </svg>
  );
}

export function OAuthButtons() {
  const { providers, t } = useAuth();
  const apiBase = getApiBaseUrl();

  const hasAnyProvider = providers.google || providers.orcid;
  if (!hasAnyProvider) {
    return null;
  }

  const handleGoogleClick = () => {
    window.location.href = `${apiBase}/api/auth/oauth/google`;
  };

  const handleOrcidClick = () => {
    window.location.href = `${apiBase}/api/auth/oauth/orcid`;
  };

  return (
    <div className="space-y-3">
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-gray-500 font-medium">
            {t("orDivider")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {providers.google && (
          <button
            type="button"
            onClick={handleGoogleClick}
            data-testid="oauth-google-btn"
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <GoogleIcon className="w-5 h-5 flex-shrink-0" />
            <span>{t("continueWithGoogle")}</span>
          </button>
        )}

        {providers.orcid && (
          <button
            type="button"
            onClick={handleOrcidClick}
            data-testid="oauth-orcid-btn"
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-[#a6ce39] rounded-xl hover:bg-[#f6fbe8] text-gray-800 text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#a6ce39]"
          >
            <OrcidIcon className="w-5 h-5 flex-shrink-0" />
            <span>{t("continueWithOrcid")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
