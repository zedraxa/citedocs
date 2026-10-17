// Run from repository root: pnpm --filter @citedocs/server exec tsx scripts/api-bench/run.mjs
import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
const {
  buildApp,
  ZoteroAccountService,
  ZoteroProxyService,
  InMemoryAuthRepository,
  InMemoryDocumentRepository,
  InMemoryWopiStorage,
  InMemoryZoteroCredentialRepository,
} = await import(process.env.BENCH_SERVER_ENTRY || "../../src/index.ts");
import { CSLEngine } from "@citedocs/csl-engine";

process.env.NODE_ENV = "test";
globalThis.fetch = async () => {
  throw new Error("Benchmark forbids network access");
};
const samples = Number(process.env.BENCH_SAMPLES || 30);
const ioMs = Number(process.env.BENCH_IO_MS || 5);
const counts = {};
function fakeIO(repo, methods) {
  return new Proxy(repo, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== "function") return value;
      return async (...args) => {
        if (methods.includes(key)) {
          counts[key] = (counts[key] || 0) + 1;
          await delay(ioMs);
        }
        return value.apply(target, args);
      };
    },
  });
}
const docs = new InMemoryDocumentRepository();
const storage = new InMemoryWopiStorage();
const credentials = new InMemoryZoteroCredentialRepository();
const styles = Array.from({ length: 10800 }, (_, i) => ({
  name: `journal-${i}`,
  title: `Journal of science ${i}`,
  categories: { format: "author-date" },
}));
const app = await buildApp({
  authRepo: fakeIO(new InMemoryAuthRepository(), [
    "findUserByEmail",
    "findSessionById",
    "findUserById",
    "createSession",
  ]),
  documentRepo: fakeIO(docs, ["listOwned", "getStorageUsage", "findRawById", "getById"]),
  wopiStorage: fakeIO(storage, ["getFileInfo"]),
  zoteroCredentialRepo: credentials,
  enableCsrf: false,
  enableRateLimit: false,
  styleFetchFn: async () => globalThis.Response.json(styles),
  zoteroProxyService: new ZoteroProxyService({
    accountService: new ZoteroAccountService({ credentialRepo: credentials }),
    fetchFn: async () => {
      counts.upstream = (counts.upstream || 0) + 1;
      await delay(25);
      return globalThis.Response.json([{ key: "ITEM1", data: { title: "Science" } }]);
    },
  }),
});
const account = await app.authService.signup({
  email: "bench@example.test",
  password: "benchmark-password",
});
const headers = { authorization: `Bearer ${account.token}` };
await credentials.save(account.user.id, {
  apiKey: "fake-local-key",
  zoteroUserId: "42",
  syncEnabled: true,
});
let doc;
for (let i = 0; i < 100; i++)
  doc = await docs.create(account.user.id, { title: `Science ${i}`, fileSize: 1024 });
await storage.createFile(
  doc.id,
  "Science.docx",
  account.user.id,
  Buffer.from("benchmark-local-file"),
);
await app.ready();
async function request(url, extra = {}) {
  const res = await app.inject({ method: "GET", url, headers, ...extra });
  assert.equal(res.statusCode, 200, `${url}: ${res.body}`);
  return res;
}
const results = [];
async function measure(name, run) {
  const coldStart = performance.now();
  await run();
  const cold = performance.now() - coldStart;
  for (let i = 0; i < 3; i++) await run();
  for (const key of Object.keys(counts)) delete counts[key];
  const times = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.error(`Measured ${name}`);
  results.push({
    name,
    coldMs: +cold.toFixed(3),
    p50Ms: +times[Math.floor(samples * 0.5)].toFixed(3),
    p95Ms: +times[Math.ceil(samples * 0.95) - 1].toFixed(3),
    calls: { ...counts },
  });
}
try {
  await measure("login", () =>
    request("/api/auth/login", {
      method: "POST",
      payload: { email: "bench@example.test", password: "benchmark-password" },
    }),
  );
  await measure("session", () => request("/api/auth/session"));
  await measure("documents", () => request("/api/documents"));
  await measure("documents-search", () => request("/api/documents?search=Science%209"));
  await measure("document-open", () => request(`/api/documents/${doc.id}`));
  await measure("onlyoffice-config", () => request(`/api/documents/${doc.id}/onlyoffice-config`));
  await measure("zotero-library", () => request("/api/zotero/proxy/users/42/items"));
  await measure("zotero-search", () => request("/api/zotero/proxy/users/42/items?q=science"));
  await measure("styles-list", () => request("/api/styles"));
  await measure("styles-search", () => request("/api/styles?q=journal"));
  await measure("csl-lookup", () => request("/api/csl/styles/apa"));
  const cslResponse = await request("/api/csl/styles/apa");
  const conditionalHeaders = {
    ...headers,
    "if-none-match": cslResponse.headers.etag || '"baseline-no-etag"',
  };
  await measure("csl-conditional", async () => {
    const res = await app.inject({ url: "/api/csl/styles/apa", headers: conditionalHeaders });
    assert.ok([200, 304].includes(res.statusCode));
  });
  // There is no citation-formatting API in apps/server; measure the shared engine separately.
  await measure("citation-engine-local-NOT-API", () => {
    const engine = new CSLEngine("apa", "tr-TR", [
      {
        id: "1",
        type: "book",
        title: "Science",
        author: [{ family: "Student" }],
        issued: { "date-parts": [[2024]] },
      },
    ]);
    assert.ok(
      engine.formatCitation({
        citationId: "c1",
        citationItems: [{ id: "1" }],
        properties: { noteIndex: 0 },
      }),
    );
    assert.ok(engine.makeBibliography().entries.length);
  });
  console.log(
    JSON.stringify(
      {
        node: process.version,
        samples,
        fakeRepositoryDelayMs: ioMs,
        fakeZoteroDelayMs: 25,
        cslBodyBytes: Buffer.byteLength(cslResponse.body),
        cslConditionalBytes: Buffer.byteLength(
          (await app.inject({ url: "/api/csl/styles/apa", headers: conditionalHeaders })).body,
        ),
        documents: 100,
        styles: 10800,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
