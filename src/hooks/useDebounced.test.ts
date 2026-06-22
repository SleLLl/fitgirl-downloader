import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounced } from "./useDebounced";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebounced", () => {
  it("returns the initial value, then the updated value after the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 400), {
      initialProps: { v: "a" },
    });
    expect(result.current).toBe("a");

    rerender({ v: "b" });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe("b");
  });
});
