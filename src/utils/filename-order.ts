/** Numeric segments sort numerically; ties have a deterministic filename order. */
export function compareFilenames(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" })
    || a.localeCompare(b, "en");
}
