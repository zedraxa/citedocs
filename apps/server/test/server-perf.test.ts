import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify from "fastify";
import { StyleIndexService } from "../src/styles/styleService.js";
import { cslRoutes } from "../src/routes/csl.js";

const catalog = (title: string) => [{ name: "test-style", title, titleShort: title }];

afterEach(() => vi.restoreAllMocks());

describe("style search derived cache", () => {
  it("reuses normalization, keeps Turkish matching and refreshes after TTL", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(catalog("ŞİŞLİ Bilim")))
      .mockResolvedValueOnce(Response.json(catalog("Yeni Başlık")));
    const service = new StyleIndexService({ fetchFn, ttlMs: 100 });
    const first = await service.searchStyles("sisli");
    expect(first.map((s) => s.id)).toEqual(["test-style"]);
    expect(await service.searchStyles("ŞİŞLİ")).toEqual(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 101;
    expect(await service.searchStyles("sisli")).toEqual([]);
    expect((await service.searchStyles("yeni"))[0].title).toBe("Yeni Başlık");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("coalesces catalog refresh and preserves the previous index on upstream failure", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(catalog("Alpha")))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json(catalog("Beta")));
    const service = new StyleIndexService({ fetchFn, ttlMs: 100 });
    const initial = await Promise.all([
      service.searchStyles("alpha"),
      service.searchStyles("alpha"),
    ]);
    expect(initial[0]).toEqual(initial[1]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 101;
    expect(await service.searchStyles("alpha")).toEqual(initial[0]);
    expect(await service.searchStyles("beta")).toHaveLength(1);
    expect(await service.searchStyles("alpha")).toEqual([]);
  });

  it("does not mix derived catalogs between service instances", async () => {
    const a = new StyleIndexService({ fetchFn: async () => Response.json(catalog("Alpha")) });
    const b = new StyleIndexService({ fetchFn: async () => Response.json(catalog("Beta")) });
    expect(await a.searchStyles("alpha")).toHaveLength(1);
    expect(await b.searchStyles("alpha")).toEqual([]);
  });
});

describe("bundled CSL HTTP validation", () => {
  it("returns identical JSON, validates weak/list tags, and rejects stale or other-style tags", async () => {
    const app = Fastify();
    await app.register(cslRoutes);
    try {
      const first = await app.inject("/api/csl/styles/apa");
      const etag = String(first.headers.etag);
      expect(first.json().xml).toContain("<style");
      expect(first.headers["cache-control"]).toBe("public, no-cache");
      for (const tag of [etag, `W/${etag}`, `"stale", ${etag}`, "*"]) {
        const res = await app.inject({
          url: "/api/csl/styles/apa",
          headers: { "if-none-match": tag },
        });
        expect(res.statusCode).toBe(304);
        expect(res.body).toBe("");
        expect(res.headers.etag).toBe(etag);
      }
      const stale = await app.inject({
        url: "/api/csl/styles/apa",
        headers: { "if-none-match": '"old-build"' },
      });
      expect(stale.statusCode).toBe(200);
      expect(stale.body).toBe(first.body);
      const other = await app.inject({
        url: "/api/csl/styles/ieee",
        headers: { "if-none-match": etag },
      });
      expect(other.statusCode).toBe(200);
      expect(other.headers.etag).not.toBe(etag);
      const missing = await app.inject({
        url: "/api/csl/styles/missing",
        headers: { "if-none-match": "*" },
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.headers.etag).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
