import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the Tauri boundary so the page renders without a running backend.
vi.mock("@/lib/api", () => ({
  fetchParts: vi.fn(),
  extractLinks: vi.fn(),
  onExtractProgress: vi.fn(() => Promise.resolve(() => {})),
}));

import Game from "./Game";

describe("Game page", () => {
  it("renders the URL input prefilled with the example game", () => {
    render(<Game />);
    expect(
      screen.getByPlaceholderText("https://fitgirl-repacks.site/<game>/")
    ).toHaveValue("https://fitgirl-repacks.site/grand-theft-auto-v/");
  });

  it("renders a Fetch links button", () => {
    render(<Game />);
    expect(
      screen.getByRole("button", { name: /fetch links/i })
    ).toBeInTheDocument();
  });
});
