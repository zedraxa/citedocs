import { lazy, Suspense, useEffect } from "react";
import {
  AuthProvider,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  ProtectedRoute,
} from "./auth/index.js";
import { useAuth } from "./auth/AuthContext.js";
import { isCollaboraBackend } from "./editorBackend.js";
import { LoadingPage } from "./LoadingPage.js";

const OnlyofficeEditorPage = lazy(() =>
  import("./onlyoffice/index.js").then((m) => ({ default: m.OnlyofficeEditorPage })),
);
const CollaboraEditorPage = lazy(() =>
  import("./collabora/index.js").then((m) => ({ default: m.CollaboraEditorPage })),
);
const AppEditor = lazy(() =>
  import("./LegacyEditorPage.js").then((m) => ({ default: m.AppEditor })),
);
const DocumentsPage = lazy(() =>
  import("./documents/index.js").then((m) => ({ default: m.DocumentsPage })),
);

/** "/" : unauthenticated -> /login, authenticated -> /documents. Never renders the legacy demo. */
function HomeRedirect() {
  const { isAuthenticated, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    window.location.replace(isAuthenticated ? "/documents" : "/login");
  }, [isAuthenticated, loading]);
  return (
    <div data-testid="home-redirect" className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function goNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.replace(
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/documents",
  );
}

function LoginRedirect() {
  useEffect(() => {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }, []);
  return null;
}

export function EditorRoute() {
  const params = new URLSearchParams(window.location.search);
  const doc = params.get("doc");
  if (!doc) {
    window.location.replace("/documents");
    return null;
  }
  if (!isCollaboraBackend()) {
    return (
      <OnlyofficeEditorPage
        documentId={doc}
        documentTitle={params.get("title") || "Adsız Belge"}
        onBackToDocuments={() => {
          window.location.href = "/documents";
        }}
      />
    );
  }
  return (
    <CollaboraEditorPage
      documentId={doc}
      documentTitle={params.get("title") || "Adsız Belge"}
      onBackToDocuments={() => {
        window.location.href = "/documents";
      }}
    />
  );
}

/** Legacy TipTap demo editor: only reachable by authenticated users at /legacy-editor. */
export function LegacyApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingPage />}>
        <AppEditor />
      </Suspense>
    </AuthProvider>
  );
}

export function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const isEditor = (path === "/" || path === "/editor") && /[?&]doc=/.test(search);
  const gate = (node: React.ReactNode) => (
    <ProtectedRoute fallback={<LoginRedirect />}>{node}</ProtectedRoute>
  );
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingPage />}>
        {path === "/login" ? (
          <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
            <LoginPage standalone onSuccess={goNext} />
          </div>
        ) : path === "/signup" ? (
          <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
            <SignupPage standalone onSuccess={goNext} />
          </div>
        ) : path === "/forgot-password" ? (
          <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
            <ForgotPasswordPage standalone />
          </div>
        ) : path === "/reset-password" ? (
          <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
            <ResetPasswordPage standalone />
          </div>
        ) : path === "/documents" || path === "/verify-email" ? (
          gate(
            <DocumentsPage
              onOpenDocument={(doc) => {
                window.location.href = `/editor?doc=${encodeURIComponent(doc.id)}&title=${encodeURIComponent(doc.title)}`;
              }}
              onNavigateToEditor={() => {
                window.location.href = "/documents";
              }}
            />,
          )
        ) : isEditor ? (
          gate(<EditorRoute />)
        ) : path === "/legacy-editor" ? (
          gate(<AppEditor />)
        ) : (
          <HomeRedirect />
        )}
      </Suspense>
    </AuthProvider>
  );
}
