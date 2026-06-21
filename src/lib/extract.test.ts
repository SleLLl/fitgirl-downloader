import { describe, expect, it } from "vitest";
import { failedSourceUrls } from "./extract";
import type { ExtractProgress } from "./api";

const p = (sourceUrl: string, status: ExtractProgress["status"]): ExtractProgress => ({
  index: 0,
  total: 1,
  sourceUrl,
  status,
  directUrl: null,
});

describe("failedSourceUrls", () => {
  it("returns only the source URLs whose status is failed", () => {
    const results: Record<string, ExtractProgress> = {
      a: p("a", "done"),
      b: p("b", "failed"),
      c: p("c", "failed"),
      d: p("d", "needs_captcha"),
    };
    expect(failedSourceUrls(results).sort()).toEqual(["b", "c"]);
  });

  it("returns empty when nothing failed", () => {
    expect(failedSourceUrls({ a: p("a", "done") })).toEqual([]);
  });
});
