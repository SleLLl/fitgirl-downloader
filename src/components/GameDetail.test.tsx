import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "@/test/providers";

vi.mock("@/lib/showcase", () => ({
  scrapeGame: vi.fn(() =>
    Promise.resolve({
      title: "Test Game",
      pageUrl: "https://fitgirl-repacks.site/test-game/",
      coverUrl: "https://img/c.jpg",
      info: [{ label: "Repack Size", value: "21 GB" }],
      screenshots: [],
    })
  ),
}));

import { GameDetail } from "./GameDetail";

describe("GameDetail", () => {
  it("renders title and info from scrapeGame", async () => {
    renderWithQuery(
      <GameDetail
        pageUrl="https://fitgirl-repacks.site/test-game/"
        onBack={vi.fn()}
      />
    );
    expect(await screen.findByText("Test Game")).toBeInTheDocument();
    expect(await screen.findByText(/21 GB/)).toBeInTheDocument();
  });
});
