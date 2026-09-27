import { describe, expect, it } from "vitest";
import { deriveRawUrl } from "./adapter";

describe("GitLab blob URL conversion", () => {
  it("derives an authenticated raw page URL without changing the file path", () => {
    expect(
      deriveRawUrl(
        "https://git.bps.go.id/rafifhasabi/query-cleaning-data-sensus-ekonomi-2026/-/blob/main/Agregat/Kategori%20F/rantabF_tabel1.sql",
      ),
    ).toBe(
      "https://git.bps.go.id/rafifhasabi/query-cleaning-data-sensus-ekonomi-2026/-/raw/main/Agregat/Kategori%20F/rantabF_tabel1.sql",
    );
  });

  it("rejects URLs outside the target repository", () => {
    expect(deriveRawUrl("https://git.bps.go.id/other/repository/-/blob/main/query.sql")).toBeNull();
    expect(deriveRawUrl("https://example.com/rafifhasabi/query-cleaning-data-sensus-ekonomi-2026/-/blob/main/query.sql")).toBeNull();
  });
});
