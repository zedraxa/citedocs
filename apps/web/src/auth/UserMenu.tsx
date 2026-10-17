import { useState, useRef, useEffect } from "react";
import {
  LogOut,
  Globe,
  LogIn,
  UserPlus,
  FolderOpen,
} from "lucide-react";
import { useAuth } from "./AuthContext.js";

export interface UserMenuProps {
  currentUser?: { name: string; color: string; id: string };
}

export function UserMenu({ currentUser }: UserMenuProps) {
  const { user, isAuthenticated, logout, lang, setLang, t, openModal } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = user?.displayName || user?.email?.split("@")[0] || currentUser?.name || "Öğrenci";
  const email = user?.email || "";
  const avatarColor = currentUser?.color || "#2563eb";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "Ö";

  const toggleLang = () => {
    setLang(lang === "tr" ? "en" : "tr");
  };

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
  };

  if (!isAuthenticated && !user && !currentUser) {
    return (
      <div className="flex items-center space-x-2">
        {/* Log In Button */}
        <button
          onClick={() => openModal("login")}
          data-testid="header-login-btn"
          className="flex items-center space-x-1 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>{t("login")}</span>
        </button>

        {/* Sign Up Button */}
        <button
          onClick={() => openModal("signup")}
          data-testid="header-signup-btn"
          className="flex items-center space-x-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>{t("signup")}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger: Student Avatar */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        data-testid="user-menu-btn"
        className="flex items-center space-x-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-blue-400 focus:outline-none transition-all cursor-pointer"
        title={`Hesap: ${displayName}`}
        aria-expanded={dropdownOpen}
      >
        <div
          style={{ backgroundColor: avatarColor }}
          className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-sm select-none"
        >
          {initials}
        </div>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div
          data-testid="user-dropdown-panel"
          className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 py-2.5 z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* User Profile Header */}
          <div className="px-4 py-2 border-b border-gray-100 flex items-center space-x-3">
            <div
              style={{ backgroundColor: avatarColor }}
              className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm ring-2 ring-gray-100 shadow-sm flex-shrink-0"
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {displayName}
              </p>
              {email && (
                <p className="text-xs text-gray-500 truncate" title={email}>
                  {email}
                </p>
              )}
            </div>
          </div>

          {/* Action Items */}
          <div className="py-1">
            {/* My Documents Link */}
            <a
              href="/documents"
              data-testid="dropdown-documents-link"
              className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-blue-600" />
              <span>{lang === "tr" ? "Belgelerim" : "My Documents"}</span>
            </a>

            {/* Language Switch */}
            <button
              onClick={toggleLang}
              data-testid="dropdown-lang-toggle-btn"
              className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              title={lang === "tr" ? "Dili İngilizce yap" : "Switch language to Turkish"}
              aria-label={`${t("language")}: ${lang === "tr" ? t("languageTurkish") : t("languageEnglish")}`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-500" />
                <span data-testid="dropdown-lang-label">{t("language")}</span>
              </div>
              <span
                data-testid="dropdown-lang-active"
                className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[11px]"
              >
                {lang === "tr" ? t("languageTurkish") : t("languageEnglish")}
              </span>
            </button>
          </div>

          {/* Logout Action */}
          <div className="pt-1 border-t border-gray-100">
            <button
              onClick={handleLogout}
              data-testid="user-logout-btn"
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>{t("logout")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
