import { expect, it, vi } from "vitest";
import { loadSnapshot, saveSnapshot } from ".";
import type { RepositorySnapshot } from "../../types";

it("replaces old groups and SQL on reimport without deleting wilayah", async () => {
  const stored: Record<string, unknown> = { wilayahConfig: { level1: ["35"], level2: [] } };
  vi.stubGlobal("chrome", { storage: { local: {
    get: async () => structuredClone(stored),
    set: async (values: Record<string, unknown>) => { Object.assign(stored, structuredClone(values)); },
  } } });
  const makeSnapshot = (path: string): RepositorySnapshot => ({
    version: 1,
    repository: { name: "repo", namespace: "local-folder", branch: "local import", syncedAt: new Date().toISOString(), sqlCount: 1 },
    groups: [{ name: "Group", path, files: [{ name: "q.sql", path: `${path}/q.sql`, content: `SELECT '${path}';` }] }],
  });
  try {
    await saveSnapshot(makeSnapshot("Old/Group"));
    await saveSnapshot(makeSnapshot("New/Group"));
    await saveSnapshot(makeSnapshot("New/Group"));
    const restored = await loadSnapshot();
    expect(restored?.groups.map((group) => group.path)).toEqual(["New/Group"]);
    expect(restored?.repository.sqlCount).toBe(1);
    expect(JSON.stringify(restored)).not.toContain("Old/Group");
    expect(stored.wilayahConfig).toEqual({ level1: ["35"], level2: [] });
  } finally { vi.unstubAllGlobals(); }
});
