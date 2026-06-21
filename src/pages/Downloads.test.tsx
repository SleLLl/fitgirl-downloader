import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppStore } from "@/store/useAppStore";
import Downloads from "./Downloads";

beforeEach(() => {
  useAppStore.setState({ downloads: {} });
});

describe("Downloads page", () => {
  it("shows an empty state with no downloads", () => {
    render(<Downloads />);
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  });
});
