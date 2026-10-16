/**
 * Attaches the double-submit CSRF header (X-CSRF-Token, from the citedocs_csrf cookie)
 * to every same-origin state-changing fetch. Several components (Collabora session,
 * Add by DOI, Zotero, PDF reader) call fetch directly and would otherwise get 403.
 */
const CSRF_COOKIE = "citedocs_csrf";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function installCsrfFetch(): void {
  if (typeof window === "undefined" || (window as unknown as { __csrfFetch?: boolean }).__csrfFetch) return;
  (window as unknown as { __csrfFetch?: boolean }).__csrfFetch = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    try {
      const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      if (!SAFE.has(method) && url.origin === window.location.origin) {
        const token = readCookie(CSRF_COOKIE);
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (token && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
        init = { ...init, headers, credentials: init.credentials || "include" };
      }
    } catch {
      // fall through with the original request
    }
    return orig(input, init);
  };
}
