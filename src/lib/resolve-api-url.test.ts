import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./resolve-api-url";

describe("resolveApiUrl", () => {
  it("keeps the configured deployment authoritative over a query parameter", () => {
    expect(
      resolveApiUrl(
        "https://attacker.example",
        "https://deployment.example/api",
      ),
    ).toBe("https://deployment.example/api");
  });

  it.each([undefined, ""])(
    "allows a user-selected deployment when no deployment is configured: %s",
    (configuredUrl) => {
      expect(resolveApiUrl("https://selected.example/api", configuredUrl)).toBe(
        "https://selected.example/api",
      );
    },
  );

  it("leaves a missing deployment empty so the connection form can be shown", () => {
    expect(resolveApiUrl("")).toBe("");
  });
});
