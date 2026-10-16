import { useState, useEffect, useMemo, useRef } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

export interface CollabPeer {
  clientId: number;
  name: string;
  color: string;
  avatar?: string;
  isSelf: boolean;
}

export type CollabConnectionStatus = "connecting" | "connected" | "disconnected" | "read-only";

const DEFAULT_COLLAB_URL = "ws://localhost:1234";

const COLLAB_COLORS = [
  "#2563eb", // Blue
  "#e11d48", // Rose/Red
  "#16a34a", // Green
  "#9333ea", // Purple
  "#ea580c", // Orange
  "#0891b2", // Cyan
  "#d97706", // Amber
  "#4f46e5", // Indigo
];

function pickColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLAB_COLORS.length;
  return COLLAB_COLORS[index]!;
}

export interface UseCollabOptions {
  url?: string;
  documentId?: string;
  userName?: string;
  userColor?: string;
  token?: string;
}

export interface UseCollabReturn {
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc;
  documentId: string;
  currentUser: { name: string; color: string; id: string };
  collaborators: CollabPeer[];
  status: CollabConnectionStatus;
  isReadOnly: boolean;
}

export function useCollab(options: UseCollabOptions = {}): UseCollabReturn {
  // Resolve collab parameters from options, URL search params, or defaults
  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const serverUrl =
    options.url ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_COLLAB_URL) ||
    DEFAULT_COLLAB_URL;

  const documentId =
    options.documentId ||
    searchParams.get("doc") ||
    searchParams.get("documentId") ||
    "demo-document";

  const rawUser =
    options.userName ||
    searchParams.get("user") ||
    searchParams.get("name") ||
    "Yusuf Kavak";

  const userColor =
    options.userColor ||
    searchParams.get("color") ||
    pickColor(rawUser);

  const currentUser = useMemo(
    () => ({
      id: rawUser,
      name: rawUser,
      color: userColor,
    }),
    [rawUser, userColor],
  );

  const token = useMemo(() => {
    if (options.token) return options.token;
    const urlToken = searchParams.get("token");
    if (urlToken) return urlToken;
    return JSON.stringify({
      userId: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
    });
  }, [options.token, searchParams, currentUser]);

  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [status, setStatus] = useState<CollabConnectionStatus>("connecting");
  const [collaborators, setCollaborators] = useState<CollabPeer[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    // Check if WebSocket is available in the environment
    if (typeof WebSocket === "undefined") {
      setStatus("disconnected");
      return;
    }

    let isMounted = true;

    try {
      const provider = new HocuspocusProvider({
        url: serverUrl,
        name: documentId,
        document: ydoc,
        token,
        broadcast: false,
        onStatus: ({ status: hpStatus }) => {
          if (!isMounted) return;
          if (hpStatus === "connected") {
            setStatus((prev) => (prev === "read-only" ? "read-only" : "connected"));
          } else if (hpStatus === "connecting") {
            setStatus("connecting");
          } else {
            setStatus("disconnected");
          }
        },
        onAuthenticated: () => {
          if (!isMounted) return;
          if ((provider as any).authorizedScope === "readonly") {
            setIsReadOnly(true);
            setStatus("read-only");
          } else {
            setStatus("connected");
          }
        },
        onAuthenticationFailed: () => {
          if (!isMounted) return;
          setStatus("disconnected");
        },
      });

      providerRef.current = provider;

      // Set current user awareness
      provider.setAwarenessField("user", {
        name: currentUser.name,
        color: currentUser.color,
      });

      // Update collaborator peer list whenever awareness changes
      const updateAwareness = () => {
        if (!isMounted) return;
        const states = provider.awareness.getStates();
        const peers: CollabPeer[] = [];

        states.forEach((state, clientId) => {
          if (state.user && state.user.name) {
            peers.push({
              clientId,
              name: state.user.name,
              color: state.user.color || "#3b82f6",
              avatar: state.user.avatar,
              isSelf: clientId === provider.document.clientID,
            });
          }
        });

        // Ensure current user is present if local state is set
        if (!peers.some((p) => p.isSelf)) {
          peers.unshift({
            clientId: provider.document.clientID,
            name: currentUser.name,
            color: currentUser.color,
            isSelf: true,
          });
        }

        setCollaborators(peers);
      };

      provider.awareness.on("change", updateAwareness);
      updateAwareness();

      return () => {
        isMounted = false;
        provider.awareness.off("change", updateAwareness);
        provider.destroy();
        provider.configuration.websocketProvider?.destroy();
        providerRef.current = null;
      };
    } catch {
      setStatus("disconnected");
    }
  }, [serverUrl, documentId, token, ydoc, currentUser]);

  return {
    provider: providerRef.current,
    ydoc,
    documentId,
    currentUser,
    collaborators,
    status,
    isReadOnly,
  };
}
