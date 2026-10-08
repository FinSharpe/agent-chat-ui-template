import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiKey, setApiKey } from "./api-key";

const TRUSTED_URL = "https://trusted.example/api";
const TEST_KEY = "test-api-key";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API key origin binding", () => {
  it("allows paths and default ports on the same origin", () => {
    setApiKey(TRUSTED_URL, TEST_KEY);

    expect(getApiKey("https://trusted.example:443/other-path")).toBe(TEST_KEY);
  });

  it.each([
    "https://other.example/api",
    "https://trusted.example.attacker.example/api",
    "http://trusted.example/api",
    "https://trusted.example:8443/api",
    "https://trusted.example@attacker.example/api",
  ])("withholds the key from a different origin: %s", (url) => {
    setApiKey(TRUSTED_URL, TEST_KEY);

    expect(getApiKey(url)).toBeNull();
  });

  it("rejects a legacy key without an associated origin", () => {
    window.localStorage.setItem("lg:chat:apiKey", TEST_KEY);

    expect(getApiKey(TRUSTED_URL)).toBeNull();
  });

  it("rebinds a newly entered key without exposing it to the old origin", () => {
    setApiKey(TRUSTED_URL, TEST_KEY);
    setApiKey("https://other.example/api", "replacement-key");

    expect(getApiKey(TRUSTED_URL)).toBeNull();
    expect(getApiKey("https://other.example/api")).toBe("replacement-key");
  });

  it.each(["", "not a URL", "/api"])(
    "does not read or replace a key for an invalid absolute URL: %s",
    (url) => {
      setApiKey(TRUSTED_URL, TEST_KEY);
      setApiKey(url, "replacement-key");

      expect(getApiKey(url)).toBeNull();
      expect(getApiKey(TRUSTED_URL)).toBe(TEST_KEY);
    },
  );

  it("fails closed when browser storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });

    expect(getApiKey(TRUSTED_URL)).toBeNull();
  });
});
