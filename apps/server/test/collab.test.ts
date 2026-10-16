import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import {
  createCollabServer,
  InMemoryDocumentAccessChecker,
  InMemoryCollabPersistence,
  parseCollabToken,
} from "../src/collab/index.js";
import type { Hocuspocus } from "@hocuspocus/server";

function cleanupProvider(provider: HocuspocusProvider) {
  provider.destroy();
  provider.configuration.websocketProvider?.destroy();
}

async function waitFor(
  fn: () => boolean | Promise<boolean>,
  { timeout = 2000, interval = 5 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  if (!(await fn())) {
    throw new Error(`waitFor condition timed out after ${timeout}ms`);
  }
}

describe("Hocuspocus Real-Time Collaboration Server", () => {
  let server: Hocuspocus;
  let port: number;
  let accessChecker: InMemoryDocumentAccessChecker;
  let persistence: InMemoryCollabPersistence;
  const activeProviders: HocuspocusProvider[] = [];

  function createProvider(options: {
    name: string;
    document: Y.Doc;
    token: string;
  }): HocuspocusProvider {
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${port}`,
      name: options.name,
      document: options.document,
      token: options.token,
      broadcast: false,
    });
    activeProviders.push(provider);
    return provider;
  }

  beforeAll(async () => {
    accessChecker = new InMemoryDocumentAccessChecker({
      documents: {
        "doc-shared": "user-owner",
        "doc-secret": "user-secret",
      },
      shares: {
        "doc-shared": {
          "user-editor": "editor",
          "user-viewer": "viewer",
          "user-commenter": "commenter",
        },
      },
    });

    persistence = new InMemoryCollabPersistence();

    server = createCollabServer({
      port: 0, // random free OS port
      accessChecker,
      persistence,
      timeout: 5000,
    });

    await server.listen();
    port = (server as unknown as { address: { port: number } }).address.port;
  });

  afterAll(async () => {
    for (const provider of activeProviders) {
      cleanupProvider(provider);
    }
    await server.destroy();
  });

  it("parses temporary dev stub tokens across JSON, delimited, and plain formats", () => {
    // JSON format
    const jsonUser = parseCollabToken(
      JSON.stringify({ userId: "student-1", name: "Alice", color: "#3b82f6" }),
    );
    expect(jsonUser).toEqual({
      id: "student-1",
      name: "Alice",
      color: "#3b82f6",
      role: undefined,
      avatar: undefined,
    });

    // Delimited format: id:name:color
    const delimUser = parseCollabToken("student-2:Bob:#ef4444");
    expect(delimUser).toEqual({
      id: "student-2",
      name: "Bob",
      color: "#ef4444",
    });

    // Bearer / Plain format
    const plainUser = parseCollabToken("Bearer student-3");
    expect(plainUser).toEqual({
      id: "student-3",
      name: "student-3",
    });

    // Empty or invalid tokens
    expect(parseCollabToken(undefined)).toBeNull();
    expect(parseCollabToken("   ")).toBeNull();
  });

  it("converges text typed in client A into client B with propagation < 50ms locally", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const providerA = createProvider({
      name: "doc-shared",
      document: docA,
      token: "user-owner",
    });

    const providerB = createProvider({
      name: "doc-shared",
      document: docB,
      token: "user-editor",
    });

    await Promise.all([
      new Promise((resolve) => providerA.on("synced", resolve)),
      new Promise((resolve) => providerB.on("synced", resolve)),
    ]);

    const textA = docA.getText("default");
    const textB = docB.getText("default");

    // Perform collaborative edits and measure local propagation latency with a small retry window
    let latency = Infinity;
    for (let attempt = 0; attempt < 3; attempt++) {
      const payload = ` [collaborative-delta-${attempt}]`;
      const start = performance.now();
      textA.insert(textA.length, payload);
      await waitFor(() => textB.toString().includes(payload), { timeout: 1000, interval: 2 });
      const elapsed = performance.now() - start;
      if (elapsed < latency) {
        latency = elapsed;
      }
      if (latency < 50) {
        break;
      }
    }

    expect(textB.toString()).toContain("collaborative-delta");
    // Assert propagation < 50 ms locally (allow a small retry window)
    expect(latency).toBeLessThan(50);
  });

  it("syncs awareness so both clients see each other's user name and color", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const providerA = createProvider({
      name: "doc-shared",
      document: docA,
      token: JSON.stringify({ userId: "user-owner", name: "Alice Owner", color: "#e11d48" }),
    });

    const providerB = createProvider({
      name: "doc-shared",
      document: docB,
      token: JSON.stringify({ userId: "user-editor", name: "Bob Editor", color: "#2563eb" }),
    });

    await Promise.all([
      new Promise((resolve) => providerA.on("synced", resolve)),
      new Promise((resolve) => providerB.on("synced", resolve)),
    ]);

    // Set awareness details
    providerA.setAwarenessField("user", {
      name: "Alice Owner",
      color: "#e11d48",
    });

    providerB.setAwarenessField("user", {
      name: "Bob Editor",
      color: "#2563eb",
    });

    // Wait until both clients receive remote awareness state
    interface PeerAwarenessRecord {
      user?: { name?: string; color?: string };
    }

    await waitFor(
      () => {
        const statesA = Array.from(providerA.awareness.getStates().values()) as PeerAwarenessRecord[];
        const statesB = Array.from(providerB.awareness.getStates().values()) as PeerAwarenessRecord[];
        const hasBobInA = statesA.some(
          (s) => s.user?.name === "Bob Editor" && s.user?.color === "#2563eb",
        );
        const hasAliceInB = statesB.some(
          (s) => s.user?.name === "Alice Owner" && s.user?.color === "#e11d48",
        );
        return hasBobInA && hasAliceInB;
      },
      { timeout: 2000, interval: 10 },
    );

    const statesInA = Array.from(providerA.awareness.getStates().values()) as PeerAwarenessRecord[];
    const statesInB = Array.from(providerB.awareness.getStates().values()) as PeerAwarenessRecord[];

    expect(
      statesInA.some((s) => s.user?.name === "Bob Editor" && s.user?.color === "#2563eb"),
    ).toBe(true);
    expect(
      statesInB.some((s) => s.user?.name === "Alice Owner" && s.user?.color === "#e11d48"),
    ).toBe(true);
  });

  it("rejects unauthorized users at authentication", async () => {
    // 1. Stranger user with no document share or ownership is rejected by access checker
    const docStranger = new Y.Doc();
    const providerStranger = createProvider({
      name: "doc-secret",
      document: docStranger,
      token: "user-unauthorized-stranger",
    });

    const rejectedStranger = await new Promise<boolean>((resolve) => {
      providerStranger.on("authenticationFailed", () => resolve(true));
      setTimeout(() => resolve(false), 1500);
    });
    expect(rejectedStranger).toBe(true);
    expect(providerStranger.isAuthenticated).toBe(false);

    // 2. User with explicitly non-existent access on doc-shared
    const docNoAccess = new Y.Doc();
    const providerNoAccess = createProvider({
      name: "doc-shared",
      document: docNoAccess,
      token: JSON.stringify({ userId: "anonymous-trespasser" }),
    });

    const rejectedNoAccess = await new Promise<boolean>((resolve) => {
      providerNoAccess.on("authenticationFailed", () => resolve(true));
      setTimeout(() => resolve(false), 1500);
    });
    expect(rejectedNoAccess).toBe(true);
    expect(providerNoAccess.isAuthenticated).toBe(false);

    // 3. Client without credentials cannot authenticate or sync
    const docNoAuth = new Y.Doc();
    const providerNoAuth = createProvider({
      name: "doc-shared",
      document: docNoAuth,
      token: "",
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(providerNoAuth.isAuthenticated).toBe(false);
    expect(providerNoAuth.isSynced).toBe(false);
  });

  it("enforces read-only mode for viewers so they cannot apply updates to the document", async () => {
    // Client Owner connects and seeds document text
    const docOwner = new Y.Doc();
    const providerOwner = createProvider({
      name: "doc-shared",
      document: docOwner,
      token: "user-owner",
    });
    await new Promise((resolve) => providerOwner.on("synced", resolve));

    const ownerText = docOwner.getText("default");
    ownerText.delete(0, ownerText.length);
    ownerText.insert(0, "Original Owner Manuscript");

    // Viewer connects to doc-shared
    const docViewer = new Y.Doc();
    const providerViewer = createProvider({
      name: "doc-shared",
      document: docViewer,
      token: "user-viewer",
    });
    await new Promise((resolve) => providerViewer.on("synced", resolve));

    // Viewer successfully reads existing content
    const viewerText = docViewer.getText("default");
    expect(viewerText.toString()).toBe("Original Owner Manuscript");

    // Viewer attempts to inject changes into the document
    viewerText.insert(0, "[HACKED BY VIEWER] ");

    // Wait to allow any potential propagation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Owner must NOT receive the viewer's changes
    expect(ownerText.toString()).toBe("Original Owner Manuscript");

    // Fresh authorized connection must see pristine state
    const docCheck = new Y.Doc();
    const providerCheck = createProvider({
      name: "doc-shared",
      document: docCheck,
      token: "user-owner",
    });
    await new Promise((resolve) => providerCheck.on("synced", resolve));

    expect(docCheck.getText("default").toString()).toBe("Original Owner Manuscript");
  });
});
