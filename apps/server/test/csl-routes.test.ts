import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/index.js";
import type { FastifyInstance } from "fastify";

describe("CSL Style Routes (/api/csl/styles/:id)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      enableRateLimit: false,
      enableCsrf: false,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns JSON style object with xml field by default", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles/ieee",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const json = res.json();
    expect(json.id).toBe("ieee");
    expect(json.citationFormat).toBe("numeric");
    expect(json.xml).toBeDefined();
    expect(json.xml).toContain("<style");
    expect(json.xml).toContain("http://purl.org/net/xbiblio/csl");
  });

  it("returns raw CSL XML when .csl extension is appended to path", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles/ieee.csl",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.citationstyles.style+xml; charset=utf-8");
    const body = res.body;
    expect(body.startsWith("<?xml") || body.startsWith("<style")).toBe(true);
    expect(body).toContain("<style");
    expect(body).toContain("ieee");
  });

  it("returns raw CSL XML when ?format=xml query parameter is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles/apa?format=xml",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.citationstyles.style+xml; charset=utf-8");
    const body = res.body;
    expect(body).toContain("<style");
    expect(body).toContain("apa");
  });

  it("returns raw CSL XML when Accept header specifies CSL XML or XML", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles/chicago-author-date",
      headers: {
        Accept: "application/vnd.citationstyles.style+xml, application/xml;q=0.9",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.citationstyles.style+xml; charset=utf-8");
    expect(res.body).toContain("<style");
    expect(res.body).toContain("chicago-author-date");
  });

  it("returns 404 when style is unknown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles/unknown-style-xyz",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Style not found");
  });

  it("supports ETag and 304 Not Modified for raw XML requests", async () => {
    const res1 = await app.inject({
      method: "GET",
      url: "/api/csl/styles/ieee.csl",
    });
    expect(res1.statusCode).toBe(200);
    const etag = res1.headers["etag"] as string;
    expect(etag).toBeDefined();

    const res2 = await app.inject({
      method: "GET",
      url: "/api/csl/styles/ieee.csl",
      headers: {
        "if-none-match": etag,
      },
    });
    expect(res2.statusCode).toBe(304);
  });
});
