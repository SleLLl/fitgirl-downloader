import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithQuery } from "@/test/providers";

const { revealItemInDir } = vi.hoisted(() => ({
  revealItemInDir: vi.fn(() => Promise.resolve()),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir }));

vi.mock("@/lib/library", async () => {
  const actual = await vi.importActual<typeof import("@/lib/library")>(
    "@/lib/library"
  );
  return {
    ...actual,
    libraryGames: vi.fn(() =>
      Promise.resolve([
        {
          name: "Cyberpunk 2077",
          dir: "/games",
          parts: 3,
          totalBytes: 3 * 1024 * 1024,
          coverUrl: "",
          samplePath: "/games/Cyberpunk.2077.part01.rar",
        },
      ])
    ),
  };
});

import Library from "./Library";

describe("Library page", () => {
  it("lists completed games and reveals on Open folder", async () => {
    renderWithQuery(<Library />);
    expect(await screen.findByText("Cyberpunk 2077")).toBeInTheDocument();
    expect(screen.getByText(/3 files/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(revealItemInDir).toHaveBeenCalledWith(
      "/games/Cyberpunk.2077.part01.rar"
    );
  });
});
