import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./index.css";
import { installCsrfFetch } from "./csrfFetch.js";
import { migrateLanguagePreference } from "./auth/languageMigration.js";

installCsrfFetch();
migrateLanguagePreference();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Remove any legacy service worker / PWA cache that could serve an old build.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
}
if (typeof caches !== "undefined") {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
