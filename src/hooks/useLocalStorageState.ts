"use client";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

/**
 * A `useState` that persists to `window.localStorage`.
 *
 * Reads the stored value synchronously via a lazy initializer so the first
 * client render already reflects it — this avoids transient renders with
 * the default value, which can confuse controlled components (e.g. Radix
 * Select) whose internal state is sensitive to the initial `value` prop.
 * On the server the initializer returns `defaultValue`, so SSR output is
 * stable.
 *
 * Pass an optional `validate` type guard to reject corrupted or
 * out-of-range values (e.g. an enum member that no longer exists).
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (!validate || validate(parsed)) {
          return parsed as T;
        }
      }
    } catch {
      // no-op
    }
    return defaultValue;
  });

  const isFirstWrite = useRef(true);
  useEffect(() => {
    if (isFirstWrite.current) {
      isFirstWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // no-op
    }
  }, [key, value]);

  return [value, setValue];
}
