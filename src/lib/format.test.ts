import { describe, expect, it } from "vitest";
import { filenameFromUrl } from "./format";

describe("filenameFromUrl", () => {
  it("uses the fragment after # when present", () => {
    expect(
      filenameFromUrl("https://fuckingfast.co/abc#Game.part1.rar")
    ).toBe("Game.part1.rar");
  });

  it("falls back to the last path segment", () => {
    expect(filenameFromUrl("https://fuckingfast.co/abc123")).toBe("abc123");
  });
});
