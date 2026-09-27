import { describe, expect, it } from "vitest";
import { addWilayahCode, normalizeWilayah, validateWilayah } from ".";

describe("wilayah validation", () => {
  it("accepts numeric level 1 and zero or more unique level 2 codes", () => {
    expect(validateWilayah({ level1: [], level2: [] }).valid).toBe(true);
    expect(validateWilayah({ level1: ["32", "35"], level2: ["3507", "3515"] }).valid).toBe(true);
  });

  it("rejects missing, non-numeric, and duplicate values", () => {
    expect(validateWilayah({ level1: "", level2: [] }).valid).toBe(false);
    expect(validateWilayah({ level1: ["ID"], level2: [] }).valid).toBe(false);
    expect(validateWilayah({ level1: ["35", "35"], level2: [] }).valid).toBe(false);
    expect(validateWilayah({ level1: ["35"], level2: ["3507", "3507"] }).valid).toBe(false);
    expect(validateWilayah({ level1: ["35"], level2: ["35-07"] }).valid).toBe(false);
  });

  it("prevents duplicate additions", () => {
    const config = { level1: ["35"], level2: ["3507"] };
    expect(addWilayahCode(config, "level2", "3507")).toBe(config);
    expect(addWilayahCode(config, "level2", "3515").level2).toEqual(["3507", "3515"]);
    expect(addWilayahCode(config, "level1", "32").level1).toEqual(["35", "32"]);
  });

  it("migrates the previous single-province storage format", () => {
    expect(normalizeWilayah({ level1: "35", level2: ["3507"] })).toEqual({ level1: ["35"], level2: ["3507"] });
  });
});
