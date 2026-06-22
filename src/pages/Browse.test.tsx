import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/showcase", () => ({
  scrapePopular: vi.fn(() =>
    Promise.resolve([
      {
        title: "Game One",
        pageUrl: "https://fitgirl-repacks.site/game-one/",
        coverUrl: "https://img/one.jpg",
      },
    ])
  ),
}));

import Browse from "./Browse";

describe("Browse page", () => {
  it("renders repack cards from the scraper", async () => {
    render(<Browse />);
    expect(await screen.findByText("Game One")).toBeInTheDocument();
  });
});
