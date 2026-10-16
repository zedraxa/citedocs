import { Hocuspocus, type Document } from "@hocuspocus/server";
import * as Y from "yjs";
import {
  type DocumentAccessChecker,
  InMemoryDocumentAccessChecker,
} from "./access.js";
import { parseCollabToken } from "./auth.js";
import {
  type CollabPersistence,
  InMemoryCollabPersistence,
} from "./persistence.js";

export interface CollabServerOptions {
  port?: number;
  accessChecker?: DocumentAccessChecker;
  persistence?: CollabPersistence;
  timeout?: number;
  debounce?: number;
  maxDebounce?: number;
}

/**
 * Default global access checker for local dev mode.
 * Pre-seeds demo documents to allow the student to open the app locally,
 * while strictly isolating unshared documents.
 */
export const defaultAccessChecker = new InMemoryDocumentAccessChecker({
  documents: {
    "demo-document": "yusuf",
    "default-doc": "yusuf",
  },
  shares: {
    "demo-document": {
      "collab-alice": "editor",
      "collab-bob": "editor",
      "collab-viewer": "viewer",
      "collab-commenter": "commenter",
      guest: "editor",
    },
    "default-doc": {
      "collab-alice": "editor",
      "collab-bob": "editor",
      "collab-viewer": "viewer",
      "collab-commenter": "commenter",
      guest: "editor",
    },
  },
});

export const defaultPersistence = new InMemoryCollabPersistence();

export function createCollabServer(
  portOrOptions: number | CollabServerOptions = 1234,
  maybeOptions?: CollabServerOptions,
): Hocuspocus {
  const options: CollabServerOptions =
    typeof portOrOptions === "number"
      ? { port: portOrOptions, ...maybeOptions }
      : portOrOptions;

  const port = options.port ?? 1234;
  const accessChecker = options.accessChecker ?? defaultAccessChecker;
  const persistence = options.persistence ?? defaultPersistence;

  const server = new Hocuspocus({
    port,
    timeout: options.timeout ?? 30000,
    debounce: options.debounce ?? 2000,
    maxDebounce: options.maxDebounce ?? 10000,

    async onAuthenticate(data) {
      const user = parseCollabToken(data.token);
      if (!user) {
        throw new Error("Unauthorized: authentication token required");
      }

      const role = await accessChecker.canAccess(user.id, data.documentName);
      if (!role) {
        throw new Error(
          `Forbidden: user "${user.id}" has no access to document "${data.documentName}"`,
        );
      }

      // Enforce read-only mode for viewers and commenters
      if (role === "viewer" || role === "commenter") {
        data.connection.readOnly = true;
      }

      return {
        user: {
          id: user.id,
          name: user.name,
          role,
          color: user.color,
        },
      };
    },

    async onLoadDocument(data: { document: Document; documentName: string }): Promise<Document> {
      const savedState = await persistence.loadDocument(data.documentName);
      if (savedState && savedState.byteLength > 0) {
        Y.applyUpdate(data.document, savedState);
      }
      return data.document;
    },

    async onStoreDocument(data: { document: Document; documentName: string }): Promise<void> {
      const state = Y.encodeStateAsUpdate(data.document);
      await persistence.storeDocument(data.documentName, state);
    },
  });

  return server;
}
