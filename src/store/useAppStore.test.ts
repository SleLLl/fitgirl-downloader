import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";

const reset = () =>
  useAppStore.setState({ parts: [], results: {}, downloads: {} });

describe("useAppStore", () => {
  beforeEach(reset);

  it("togglePart flips one part's checked", () => {
    useAppStore.setState({
      parts: [
        { url: "a", checked: true },
        { url: "b", checked: true },
      ],
    });
    useAppStore.getState().togglePart(1);
    expect(useAppStore.getState().parts).toEqual([
      { url: "a", checked: true },
      { url: "b", checked: false },
    ]);
  });

  it("mergeResult and mergeDownload upsert by key", () => {
    useAppStore.getState().mergeResult({
      index: 0,
      total: 1,
      sourceUrl: "s",
      status: "done",
      directUrl: "d",
    });
    expect(useAppStore.getState().results.s.directUrl).toBe("d");
    useAppStore.getState().mergeDownload({
      id: "dl1",
      url: "u",
      filename: "f",
      dir: "/d",
      totalBytes: 10,
      downloadedBytes: 5,
      status: "downloading",
      speedBps: 1,
    });
    expect(useAppStore.getState().downloads.dl1.downloadedBytes).toBe(5);
  });

  it("resetExtraction clears parts and results", () => {
    useAppStore.setState({ parts: [{ url: "a", checked: true }] });
    useAppStore.getState().resetExtraction();
    expect(useAppStore.getState().parts).toEqual([]);
  });

  it("selectPart shift-extends the range to the anchor's state", () => {
    useAppStore.setState({
      parts: ["a", "b", "c", "d", "e"].map((url) => ({ url, checked: false })),
      selectionAnchor: null,
    });
    // plain click on index 1 → checks it + sets anchor
    useAppStore.getState().selectPart(1, false);
    // shift-click on index 3 → range [1..3] takes the anchor's state (checked)
    useAppStore.getState().selectPart(3, true);
    expect(useAppStore.getState().parts.map((p) => p.checked)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it("setSettings stores the settings object", () => {
    useAppStore.getState().setSettings({
      downloadDir: "/d",
      fileConcurrency: 3,
      segments: 4,
    });
    expect(useAppStore.getState().settings?.downloadDir).toBe("/d");
  });
});
