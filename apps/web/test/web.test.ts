import { describe, it, expect } from "vitest";
import { App } from "../src/App.js";

describe("@citedocs/web", () => {
  it("exports App component function", () => {
    expect(typeof App).toBe("function");
  });
});
