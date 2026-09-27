import { describe, expect, it } from "vitest";
import type { RepositorySnapshot } from "../../types";
import { deserializeSnapshot, serializeSnapshot } from "./serialization";
import { validateSnapshot } from "./validation";

const snapshot: RepositorySnapshot = {
  version: 1,
  repository: {
    name: "repo",
    namespace: "owner",
    branch: "main",
    commit: "ab6a9a6a",
    syncedAt: "2026-09-23T14:15:00.000Z",
    sqlCount: 1,
  },
  groups: [
    {
      name: "A",
      path: "Agregat/A",
      files: [{ name: "a.sql", path: "Agregat/A/a.sql", content: "select 1;" }],
    },
  ],
};

describe("snapshot storage boundary", () => {
  it("validates a complete snapshot and rejects count mismatches", () => {
    expect(validateSnapshot(snapshot)).toBe(true);
    expect(validateSnapshot({ ...snapshot, repository: { ...snapshot.repository, sqlCount: 2 } })).toBe(false);
  });

  it("serializes and deserializes without sharing mutable references", () => {
    const serialized = serializeSnapshot(snapshot);
    const restored = deserializeSnapshot(serialized);
    expect(restored).toEqual(snapshot);
    expect(restored).not.toBe(snapshot);
    expect(restored?.groups).not.toBe(snapshot.groups);
  });

  it("rejects malformed stored data", () => {
    expect(deserializeSnapshot({ version: 1, repository: {}, groups: [] })).toBeNull();
  });
});
