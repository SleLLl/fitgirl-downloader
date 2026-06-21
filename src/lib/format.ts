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
