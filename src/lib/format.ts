import type { ExtractProgress } from "./api";

/// Human-readable text for an extraction status (used in the status line).
export function statusText(status: ExtractProgress["status"]): string {
  switch (status) {
    case "processing":
      return "working…";
    case "needs_captcha":
      return "solve the captcha in the opened window";
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

/// Derive a human-readable filename from a fuckingfast URL, mirroring the
/// original Python logic: prefer the fragment after '#', else the last segment.
export function filenameFromUrl(url: string): string {
  if (url.includes("#")) {
    const frag = url.split("#").pop();
    if (frag) return frag;
  }
  const seg = url.split("/").pop();
  return seg ?? url;
}
