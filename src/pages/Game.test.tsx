import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ExtractProgress } from "@/lib/api";

let progressCb: ((p: ExtractProgress) => void) | null = null;
const fetchPartsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchParts: (...args: unknown[]) => fetchPartsMock(...args),
  extractLinks: vi.fn(() => Promise.resolve([])),
  cancelExtraction: vi.fn(() => Promise.resolve()),
  onExtractProgress: vi.fn((cb: (p: ExtractProgress) => void) => {
    progressCb = cb;
    return Promise.resolve(() => {});
  }),
}));

import Game from "./Game";

beforeEach(() => {
  progressCb = null;
  fetchPartsMock.mockReset();
});

describe("Game page", () => {
  it("renders the URL input prefilled with the example game", () => {
    render(<Game />);
    expect(
      screen.getByPlaceholderText("https://fitgirl-repacks.site/<game>/")
    ).toHaveValue("https://fitgirl-repacks.site/grand-theft-auto-v/");
  });

  it("shows Retry failed once a part reports failed", async () => {
    fetchPartsMock.mockResolvedValue({
      valid: true,
      parts: ["https://fuckingfast.co/abc"],
    });
    render(<Game />);
    fireEvent.click(screen.getByRole("button", { name: /fetch links/i }));
    await screen.findByText("abc");

    await act(async () => {
      progressCb?.({
        index: 0,
        total: 1,
        sourceUrl: "https://fuckingfast.co/abc",
        status: "failed",
        directUrl: null,
      });
    });

    expect(
      await screen.findByRole("button", { name: /retry failed/i })
    ).toBeInTheDocument();
  });
});
