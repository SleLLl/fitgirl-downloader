import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppStore } from "@/store/useAppStore";
import Game from "./Game";

beforeEach(() => {
  useAppStore.setState({
    url: "https://fitgirl-repacks.site/grand-theft-auto-v/",
    parts: [],
    results: {},
    downloads: {},
    busy: false,
  });
});

describe("Game page", () => {
  it("renders the URL input prefilled with the example game", () => {
    render(<Game />);
    expect(
      screen.getByPlaceholderText("https://fitgirl-repacks.site/<game>/")
    ).toHaveValue("https://fitgirl-repacks.site/grand-theft-auto-v/");
  });

  it("shows Retry failed once a part reports failed", () => {
    useAppStore.setState({
      parts: [{ url: "https://fuckingfast.co/abc", checked: true }],
      results: {
        "https://fuckingfast.co/abc": {
          index: 0,
          total: 1,
          sourceUrl: "https://fuckingfast.co/abc",
          status: "failed",
          directUrl: null,
        },
      },
    });
    render(<Game />);
    expect(
      screen.getByRole("button", { name: /retry failed/i })
    ).toBeInTheDocument();
  });
});
