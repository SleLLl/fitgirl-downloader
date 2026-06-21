import { describe, expect, it } from "vitest";
import { buildRequests, formatBytes, formatSpeed } from "./download";
import type { ExtractProgress } from "./api";

const p = (sourceUrl: string, directUrl: string | null): ExtractProgress => ({
  index: 0,
  total: 1,
  sourceUrl,
  status: directUrl ? "done" : "failed",
  directUrl,
});

describe("buildRequests", () => {
  it("pairs each resolved directUrl with the source filename", () => {
    const results: Record<string, ExtractProgress> = {
      "https://fuckingfast.co/x#Game.part1.rar": p(
        "https://fuckingfast.co/x#Game.part1.rar",
        "https://dl.fuckingfast.co/dl/AAA"
      ),
      "https://fuckingfast.co/y#Game.part2.rar": p(
        "https://fuckingfast.co/y#Game.part2.rar",
        null
      ),
    };
    expect(buildRequests(results)).toEqual([
      { url: "https://dl.fuckingfast.co/dl/AAA", filename: "Game.part1.rar" },
    ]);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("formatSpeed", () => {
  it("appends /s", () => {
    expect(formatSpeed(1024)).toBe("1.0 KB/s");
  });
});
