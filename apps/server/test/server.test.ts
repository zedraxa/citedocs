import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/index.js";
import type { FastifyInstance } from "fastify";

describe("@citedocs/server", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds to /health with ok status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("citedocs-server");
  });

  it("returns available CSL styles on /api/csl/styles", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles",
    });

    expect(res.statusCode).toBe(200);
    const styles = JSON.parse(res.body);
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThanOrEqual(10);
    expect(styles.some((s: { id: string }) => s.id === "apa")).toBe(true);
  });

  it("searches CSL styles with query parameter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/csl/styles?q=ieee",
    });

    expect(res.statusCode).toBe(200);
    const styles = JSON.parse(res.body);
    expect(styles).toHaveLength(1);
    expect(styles[0].id).toBe("ieee");
  });

  it("validates invalid input for /api/zotero/search", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/zotero/search",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Invalid input");
  });
});
