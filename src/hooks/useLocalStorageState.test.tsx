import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLocalStorageState } from "./useLocalStorageState";

const KEY = "test:value";

describe("useLocalStorageState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns the default value when localStorage is empty", () => {
    const { result } = renderHook(() =>
      useLocalStorageState<string>(KEY, "default"),
    );
    expect(result.current[0]).toBe("default");
  });

  it("reads the stored value synchronously on mount", () => {
    window.localStorage.setItem(KEY, JSON.stringify("stored"));
    const { result } = renderHook(() =>
      useLocalStorageState<string>(KEY, "default"),
    );
    expect(result.current[0]).toBe("stored");
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState<string>(KEY, "default"),
    );

    act(() => {
      result.current[1]("next");
    });

    expect(result.current[0]).toBe("next");
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify("next"));
  });

  it("does not write to localStorage on the initial render", () => {
    renderHook(() => useLocalStorageState<string>(KEY, "default"));
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("falls back to the default when a validator rejects the stored value", () => {
    window.localStorage.setItem(KEY, JSON.stringify("invalid"));
    const allowed = new Set(["a", "b"]);
    const { result } = renderHook(() =>
      useLocalStorageState<string>(
        KEY,
        "a",
        (value): value is string =>
          typeof value === "string" && allowed.has(value),
      ),
    );
    expect(result.current[0]).toBe("a");
  });

  it("accepts the stored value when the validator passes", () => {
    window.localStorage.setItem(KEY, JSON.stringify("b"));
    const allowed = new Set(["a", "b"]);
    const { result } = renderHook(() =>
      useLocalStorageState<string>(
        KEY,
        "a",
        (value): value is string =>
          typeof value === "string" && allowed.has(value),
      ),
    );
    expect(result.current[0]).toBe("b");
  });

  it("falls back to the default when the stored JSON is malformed", () => {
    window.localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() =>
      useLocalStorageState<string>(KEY, "default"),
    );
    expect(result.current[0]).toBe("default");
  });

  it("supports functional setter updates", () => {
    const { result } = renderHook(() =>
      useLocalStorageState<number>(KEY, 0),
    );

    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(window.localStorage.getItem(KEY)).toBe("2");
  });
});
