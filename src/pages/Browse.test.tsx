import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithQuery } from "@/test/providers";

vi.mock("@/lib/showcase", () => ({
  scrapePopular: vi.fn(() =>
    Promise.resolve([
      {
        title: "Popular One",
        pageUrl: "https://fitgirl-repacks.site/popular-one/",
        coverUrl: "https://img/one.jpg",
        tags: [],
      },
    ])
  ),
  searchRepacks: vi.fn(() =>
    Promise.resolve([
      {
        title: "Search Hit",
        pageUrl: "https://fitgirl-repacks.site/search-hit/",
        coverUrl: "",
        tags: ["strategy", "3d"],
      },
      {
        title: "Action Hit",
        pageUrl: "https://fitgirl-repacks.site/action-hit/",
        coverUrl: "",
        tags: ["action"],
      },
    ])
  ),
  // RepackCard lazily fetches covers for results that lack one.
  scrapeGame: vi.fn(() =>
    Promise.resolve({
      title: "Search Hit",
      pageUrl: "https://fitgirl-repacks.site/search-hit/",
      coverUrl: "https://img/hit.jpg",
      info: [],
      screenshots: [],
    })
  ),
}));

import Browse from "./Browse";

describe("Browse page", () => {
  it("renders the popular grid by default", async () => {
    renderWithQuery(<Browse onSelect={vi.fn()} />);
    expect(await screen.findByText("Popular One")).toBeInTheDocument();
  });

  it("shows search results after typing a query", async () => {
    renderWithQuery(<Browse onSelect={vi.fn()} />);
    fireEvent.change(
      screen.getByPlaceholderText(/search the fitgirl catalog/i),
      { target: { value: "cyberpunk" } }
    );
    expect(await screen.findByText("Search Hit")).toBeInTheDocument();
  });

  it("filters results by a selected tag", async () => {
    renderWithQuery(<Browse onSelect={vi.fn()} />);
    fireEvent.change(
      screen.getByPlaceholderText(/search the fitgirl catalog/i),
      { target: { value: "cyberpunk" } }
    );
    expect(await screen.findByText("Action Hit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "strategy" }));
    expect(screen.getByText("Search Hit")).toBeInTheDocument();
    expect(screen.queryByText("Action Hit")).not.toBeInTheDocument();
  });
});
