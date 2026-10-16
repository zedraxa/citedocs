import { Hocuspocus, type Document } from "@hocuspocus/server";

export function createCollabServer(port = 1234): Hocuspocus {
  const server = new Hocuspocus({
    port,
    timeout: 30000,
    debounce: 2000,
    maxDebounce: 10000,

    async onAuthenticate(data: { token?: string }) {
      const { token } = data;
      // In development or when no token is passed, allow guest access with anonymous identifier
      if (!token) {
        return {
          user: {
            id: "guest-" + Math.random().toString(36).substring(7),
            name: "Guest Student",
            role: "editor",
          },
        };
      }

      return {
        user: {
          id: "authenticated-user",
          name: "Yusuf Kavak",
          role: "owner",
        },
      };
    },

    async onLoadDocument(data: { document: Document }): Promise<Document> {
      // In-memory or database document loader
      return data.document;
    },

    async onStoreDocument(data: { document: Document }): Promise<void> {
      // Persistence hook for PostgreSQL or S3
      void data;
    },
  });

  return server;
}
