import type { AuthLanguage } from "./types.js";

export const translations = {
  en: {
    appName: "CiteDocs",
    tagline: "Free Collaborative Academic Writing & Citation Platform",
    freeGuarantee:
      "CiteDocs is 100% free for students & researchers. No paywalls, no tiers, no credit card required.",
    freeBadge: "100% Free & Open Source",
    login: "Log In",
    signup: "Sign Up",
    logout: "Log Out",
    loggingOut: "Logging out...",
    email: "Email address",
    emailPlaceholder: "student@university.edu",
    password: "Password",
    passwordPlaceholder: "At least 8 characters",
    confirmPassword: "Confirm password",
    displayName: "Full Name",
    displayNamePlaceholder: "e.g. Marie Curie",
    forgotPassword: "Forgot password?",
    resetPassword: "Reset Password",
    newPassword: "New Password",
    verifyEmail: "Verify Email",
    verificationToken: "Verification Token",
    resetToken: "Reset Token",
    continueWithGoogle: "Continue with Google",
    continueWithOrcid: "Continue with ORCID",
    orDivider: "OR",
    alreadyHaveAccount: "Already have an account?",
    dontHaveAccount: "Don't have an account?",
    backToLogin: "Back to Log In",
    sendResetLink: "Send Reset Link",
    submitting: "Please wait...",
    verifiedBadge: "Verified Student",
    unverifiedBadge: "Email Unverified",
    verifyNow: "Verify Now",
    resendVerification: "Resend verification email",
    resendSuccess: "Verification email sent. Please check your inbox.",
    passwordMin: "Password must be at least 8 characters",
    passwordMismatch: "Passwords do not match",
    invalidEmail: "Please enter a valid email address",
    successResetSent:
      "If an account exists with that email, a password reset link has been sent.",
    successPasswordChanged:
      "Password updated successfully! You can now log in with your new password.",
    successEmailVerified: "Your email has been successfully verified! Welcome aboard.",
    loginRequiredNotice: "Please sign in or create a free account to access CiteDocs.",
    guestModeNotice: "Working in Guest mode. Sign in to sync with Zotero and Cloud.",
    profile: "Profile",
    language: "Language",
    languageTurkish: "Türkçe",
    languageEnglish: "English",
    close: "Close",
    requiredFields: "Please fill in all fields",
    errorNetwork: "Could not connect to server. Please check your internet connection.",
    errorInvalidCredentials: "Invalid email or password",
    errorRateLimit: "Too many requests. Please wait and try again.",
    errorSessionExpired: "Your session has expired. Please log in again.",
    errorEmailExists: "An account with this email address already exists.",
    errorTokenExpired: "The link or code has expired. Please request a new one.",
    errorInvalidToken: "Invalid verification or reset code.",
    errorServerError: "A server error occurred. Please try again later.",
    errorForbidden: "Security verification failed or access denied.",
    errorNotFound: "User or resource not found.",
    errorDefault: "An error occurred during the request.",
  },
  tr: {
    appName: "CiteDocs",
    tagline: "Öğrenciler İçin Ücretsiz Akademik Yazım ve Atıf Platformu",
    freeGuarantee:
      "CiteDocs öğrenciler ve araştırmacılar için %100 ücretsizdir. Ödeme duvarı, ücretli paket veya kredi kartı gerektirmez.",
    freeBadge: "%100 Ücretsiz ve Açık Kaynak",
    login: "Giriş Yap",
    signup: "Kayıt Ol",
    logout: "Çıkış Yap",
    loggingOut: "Çıkış yapılıyor...",
    email: "E-posta Adresi",
    emailPlaceholder: "ogrenci@universite.edu.tr",
    password: "Şifre",
    passwordPlaceholder: "En az 8 karakter",
    confirmPassword: "Şifreyi Onayla",
    displayName: "Ad Soyad",
    displayNamePlaceholder: "Örn: Cahit Arf",
    forgotPassword: "Şifrenizi mi unuttunuz?",
    resetPassword: "Şifreyi Sıfırla",
    newPassword: "Yeni Şifre",
    verifyEmail: "E-postayı Doğrula",
    verificationToken: "Doğrulama Kodu",
    resetToken: "Sıfırlama Kodu",
    continueWithGoogle: "Google ile Devam Et",
    continueWithOrcid: "ORCID ile Devam Et",
    orDivider: "VEYA",
    alreadyHaveAccount: "Zaten hesabınız var mı?",
    dontHaveAccount: "Hesabınız yok mu?",
    backToLogin: "Giriş Ekranına Dön",
    sendResetLink: "Sıfırlama Bağlantısı Gönder",
    submitting: "Lütfen bekleyin...",
    verifiedBadge: "Doğrulanmış Öğrenci",
    unverifiedBadge: "E-posta Doğrulanmadı",
    verifyNow: "Şimdi Doğrula",
    resendVerification: "Doğrulama e-postasını tekrar gönder",
    resendSuccess: "Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.",
    passwordMin: "Şifre en az 8 karakter olmalıdır",
    passwordMismatch: "Şifreler birbiriyle eşleşmiyor",
    invalidEmail: "Lütfen geçerli bir e-posta adresi girin",
    successResetSent:
      "Bu e-posta ile kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi.",
    successPasswordChanged:
      "Şifreniz başarıyla güncellendi! Artık yeni şifrenizle giriş yapabilirsiniz.",
    successEmailVerified: "E-posta adresiniz başarıyla doğrulandı! Hoş geldiniz.",
    loginRequiredNotice: "CiteDocs'a erişmek için lütfen giriş yapın veya ücretsiz hesap oluşturun.",
    guestModeNotice: "Misafir modunda çalışıyorsunuz. Zotero ve Bulut senkronizasyonu için giriş yapın.",
    profile: "Profil",
    language: "Dil",
    languageTurkish: "Türkçe",
    languageEnglish: "English",
    close: "Kapat",
    requiredFields: "Lütfen tüm alanları doldurun",
    errorNetwork: "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.",
    errorInvalidCredentials: "Geçersiz e-posta veya şifre",
    errorRateLimit: "Çok fazla istek yapıldı. Lütfen biraz bekleyip tekrar deneyin.",
    errorSessionExpired: "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.",
    errorEmailExists: "Bu e-posta adresi ile zaten bir hesap kayıtlı.",
    errorTokenExpired: "Bağlantı veya kodun süresi dolmuş. Lütfen yeni bir istek gönderin.",
    errorInvalidToken: "Geçersiz doğrulama veya sıfırlama kodu.",
    errorServerError: "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.",
    errorForbidden: "Güvenlik doğrulaması başarısız oldu veya yetkiniz yok.",
    errorNotFound: "Kullanıcı bulunamadı.",
    errorDefault: "İşlem sırasında bir hata oluştu.",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getTranslation(lang: AuthLanguage, key: TranslationKey): string {
  const dict = translations[lang] || translations.en;
  return dict[key] || translations.en[key] || key;
}

export function getLocalizedAuthError(
  codeOrStatus: string | number,
  fallbackMessage?: string,
  lang: AuthLanguage = "tr"
): string {
  const dict = translations[lang] || translations.tr;
  const strCode = String(codeOrStatus).toUpperCase();

  if (
    strCode === "INVALID_CREDENTIALS" ||
    (strCode === "401" && (!fallbackMessage || fallbackMessage.toLowerCase().includes("invalid")))
  ) {
    return dict.errorInvalidCredentials;
  }
  if (
    strCode === "429" ||
    strCode === "RATE_LIMIT_EXCEEDED" ||
    strCode === "TOO_MANY_REQUESTS"
  ) {
    return dict.errorRateLimit;
  }
  if (strCode === "SESSION_EXPIRED" || strCode === "401") {
    return dict.errorSessionExpired;
  }
  if (
    strCode === "EMAIL_EXISTS" ||
    strCode === "EMAIL_ALREADY_EXISTS" ||
    strCode === "409"
  ) {
    return dict.errorEmailExists;
  }
  if (strCode === "TOKEN_EXPIRED") {
    return dict.errorTokenExpired;
  }
  if (strCode === "INVALID_TOKEN") {
    return dict.errorInvalidToken;
  }
  if (strCode === "MISSING_PASSWORD") {
    return dict.passwordMin;
  }
  if (strCode === "INVALID_EMAIL") {
    return dict.invalidEmail;
  }
  if (strCode === "403" || strCode === "FORBIDDEN") {
    return dict.errorForbidden;
  }
  if (strCode === "USER_NOT_FOUND" || strCode === "404") {
    return dict.errorNotFound;
  }
  if (strCode === "NETWORK_ERROR") {
    return dict.errorNetwork;
  }
  const numStatus = typeof codeOrStatus === "number" ? codeOrStatus : parseInt(String(codeOrStatus), 10);
  if (!isNaN(numStatus) && numStatus >= 500) {
    return dict.errorServerError;
  }

  if (fallbackMessage) {
    const lower = fallbackMessage.toLowerCase();
    if (lower.includes("server error") || lower.includes("internal server error") || lower.includes("upstream")) {
      return dict.errorServerError;
    }
    if (lower.includes("invalid email or password") || lower.includes("invalid credentials")) {
      return dict.errorInvalidCredentials;
    }
    if (lower.includes("rate limit") || lower.includes("too many requests")) {
      return dict.errorRateLimit;
    }
    if (lower.includes("session expired") || lower.includes("unauthorized")) {
      return dict.errorSessionExpired;
    }
    if (lower.includes("already exists") || lower.includes("email exists")) {
      return dict.errorEmailExists;
    }
    if (lower.includes("token") && (lower.includes("expired") || lower.includes("invalid"))) {
      return dict.errorTokenExpired;
    }
    if (
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("fetch failed") ||
      lower.includes("network request failed") ||
      lower.includes("network error")
    ) {
      return dict.errorNetwork;
    }
    if (lower.includes("password must be at least")) {
      return dict.passwordMin;
    }
    if (lower.includes("passwords do not match")) {
      return dict.passwordMismatch;
    }
    if (lower.includes("please enter a valid email")) {
      return dict.invalidEmail;
    }
    return fallbackMessage;
  }

  return dict.errorDefault;
}
