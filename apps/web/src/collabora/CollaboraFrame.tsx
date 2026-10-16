import { useEffect, useRef, useState, useId } from "react";
import {
  useCollaboraPostMessage,
  type CollaboraPostMessageHandlers,
} from "./postMessage.js";

export interface CollaboraFrameProps extends CollaboraPostMessageHandlers {
  actionUrl: string;
  accessToken: string;
  accessTokenTtl: number;
  collaboraOrigin?: string;
  className?: string;
  title?: string;
  onFrameReady?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * CollaboraFrame component embeds Collabora Online CODE via WOPI.
 * It submits a hidden HTML form containing access_token and access_token_ttl
 * directly into the iframe, automatically sends Host_PostmessageReady on load,
 * and monitors loading status / document loaded events via postMessage.
 */
/**
 * Pass an explicit, valid BCP-47 UI language to Collabora. Without it, browsers that report an
 * unusual navigator.language (e.g. headless/POSIX locales) make cool.html throw
 * "Incorrect locale information provided" before it sends its `load`, and the document only
 * opens after Collabora's load timeout kills and retries the session.
 */
function withLang(url: string): string {
  if (/[?&]lang=/.test(url)) return url;
  let lang = "en-US";
  try {
    const cand = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    lang = Intl.getCanonicalLocales(cand)[0] || "en-US";
  } catch {
    lang = "en-US";
  }
  return `${url}${url.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}`;
}

export function CollaboraFrame({
  actionUrl,
  accessToken,
  accessTokenTtl,
  collaboraOrigin,
  className = "w-full h-full relative",
  title = "Collabora Online Document Editor",
  onLoadingStatus,
  onDocumentLoaded,
  onSaveResponse,
  onMessage,
  onFrameReady,
  iframeRef: externalIframeRef,
}: CollaboraFrameProps) {
  const uniqueId = useId().replace(/[:]/g, "_");
  const frameName = `collabora-frame-${uniqueId}`;

  const internalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeRef = externalIframeRef || internalIframeRef;
  const formRef = useRef<HTMLFormElement | null>(null);

  const [formSubmitted, setFormSubmitted] = useState(false);

  // Hook up postMessage communication
  const { isDocumentLoaded, loadingStatus, notifyReady } =
    useCollaboraPostMessage({
      iframeRef,
      collaboraOrigin,
      onLoadingStatus,
      onDocumentLoaded,
      onSaveResponse,
      onMessage,
    });

  // Submit the form into the iframe once actionUrl and accessToken are provided
  useEffect(() => {
    if (actionUrl && accessToken && formRef.current) {
      const form = formRef.current;
      let cancelled = false;
      (async () => {
        // CODE always auto-shows its "Explore the new <version>" welcome dialog
        // (welcome.enable=false is ignored in CODE builds). It is suppressed per browser via the
        // WSDWelcomeVersion pref, which lives in localStorage of the Collabora origin. Collabora is
        // served from our own origin, so we can pre-seed it before the iframe loads.
        try {
          const origin = new URL(actionUrl, window.location.href).origin;
          if (origin === window.location.origin) {
            const res = await fetch(`${origin}/hosting/capabilities`);
            const caps = (await res.json()) as { productVersion?: string };
            if (caps.productVersion) window.localStorage.setItem("WSDWelcomeVersion", caps.productVersion);
          }
        } catch {
          // best-effort
        }
        if (cancelled) return;
        try {
          form.submit();
          setFormSubmitted(true);
        } catch (err) {
          console.error("Failed to submit Collabora WOPI form into iframe:", err);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [actionUrl, accessToken]);

  const handleIframeLoad = () => {
    // When iframe finishes initial load, send Host_PostmessageReady to Collabora
    notifyReady();
    onFrameReady?.();
  };

  return (
    <div className={className} data-testid="collabora-container">
      {/* Hidden POST form per standard WOPI iframe bootstrap */}
      <form
        ref={formRef}
        action={withLang(actionUrl)}
        method="POST"
        target={frameName}
        style={{ display: "none" }}
        data-testid="collabora-form"
      >
        <input type="hidden" name="access_token" value={accessToken} />
        <input type="hidden" name="access_token_ttl" value={String(accessTokenTtl)} />
      </form>

      {/* Target IFrame */}
      <iframe
        id={frameName}
        name={frameName}
        ref={iframeRef}
        title={title}
        data-testid="collabora-iframe"
        className="w-full h-full border-0"
        allow="clipboard-read *; clipboard-write *; fullscreen"
        onLoad={handleIframeLoad}
      />

      {/* Status Overlay while document is initializing */}
      {!isDocumentLoaded && formSubmitted && (
        <div
          data-testid="collabora-loading"
          className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center pointer-events-none transition-opacity duration-300"
        >
          <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-lg shadow-md border border-slate-200 text-slate-700 text-sm font-medium">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>
              {loadingStatus === "init" || !loadingStatus
                ? "Connecting to Collabora Online..."
                : `Loading: ${loadingStatus}...`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
