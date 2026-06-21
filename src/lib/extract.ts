import type { ExtractProgress } from "./api";

/// Source URLs whose latest extraction status is "failed".
export function failedSourceUrls(
  results: Record<string, ExtractProgress>
): string[] {
  return Object.values(results)
    .filter((p) => p.status === "failed")
    .map((p) => p.sourceUrl);
}
