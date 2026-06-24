import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppStore } from "@/store/useAppStore";
import { PartRow } from "./PartRow";

beforeEach(() => {
  useAppStore.setState({ results: {}, downloads: {} });
});

describe("PartRow", () => {
  it("shows the inline download indicator when a matching download exists", () => {
    useAppStore.setState({
      downloads: {
        dl1: {
          id: "dl1",
          url: "u",
          filename: "abc",
          dir: "/d",
          gameTitle: "",
          gameCover: "",
          totalBytes: 100,
          downloadedBytes: 50,
          status: "downloading",
          speedBps: 1,
        },
      },
    });
    render(
      <PartRow
        part={{ url: "https://fuckingfast.co/x#abc", checked: true }}
        index={0}
      />
    );
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });
});
