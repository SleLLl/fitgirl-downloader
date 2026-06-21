import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/download", async () => {
  const actual = await vi.importActual<typeof import("@/lib/download")>(
    "@/lib/download"
  );
  return {
    ...actual,
    listDownloads: vi.fn(() => Promise.resolve([])),
    onDownloadProgress: vi.fn(() => Promise.resolve(() => {})),
  };
});

import Downloads from "./Downloads";

describe("Downloads page", () => {
  it("shows an empty state with no downloads", async () => {
    render(<Downloads />);
    expect(await screen.findByText(/no downloads yet/i)).toBeInTheDocument();
  });
});
