/// <reference types="vite/client" />

/** Collabora is opt-in at build time; URL parameters cannot enable it. */
export function isCollaboraBackend(): boolean {
  return import.meta.env.VITE_EDITOR_BACKEND === "collabora";
}
