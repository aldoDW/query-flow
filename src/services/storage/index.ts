import type { RepositorySnapshot, WilayahConfig } from "../../types";
import { compareFilenames } from "../../utils/filename-order";
import { validateSnapshot } from "./validation";
import { deserializeSnapshot, serializeSnapshot } from "./serialization";
import { DEFAULT_WILAYAH, normalizeWilayah, validateWilayah } from "../wilayah";

const SNAPSHOT_KEY = "repositorySnapshot";
const WILAYAH_KEY = "wilayahConfig";

export async function loadSnapshot(): Promise<RepositorySnapshot | null> {
  const stored = await chrome.storage.local.get(SNAPSHOT_KEY);
  const value: unknown = stored[SNAPSHOT_KEY];
  const snapshot = deserializeSnapshot(value);
  if (!snapshot) return null;
  const filtered = withoutRoot(snapshot);
  if (filtered.repository.sqlCount !== snapshot.repository.sqlCount) {
    await saveSnapshot(filtered);
  }
  return filtered;
}

export async function saveSnapshot(snapshot: RepositorySnapshot): Promise<void> {
  if (!validateSnapshot(snapshot)) throw new Error("Snapshot repository tidak valid.");
  await chrome.storage.local.set({ [SNAPSHOT_KEY]: serializeSnapshot(withoutRoot(snapshot)) });
}

function withoutRoot(snapshot: RepositorySnapshot): RepositorySnapshot {
  const groups = snapshot.groups.filter((group) => group.path !== "." && group.path !== "")
    .map((group) => ({ ...group, files: [...group.files].sort((a, b) => compareFilenames(a.name, b.name)) }));
  return {
    ...snapshot,
    groups,
    repository: { ...snapshot.repository, sqlCount: groups.reduce((count, group) => count + group.files.length, 0) },
  };
}

export async function loadWilayah(): Promise<WilayahConfig> {
  const stored = await chrome.storage.local.get(WILAYAH_KEY);
  const value: unknown = stored[WILAYAH_KEY];
  const normalized = normalizeWilayah(value);
  if (!normalized) return structuredClone(DEFAULT_WILAYAH);
  if (JSON.stringify(normalized) !== JSON.stringify(value)) {
    await chrome.storage.local.set({ [WILAYAH_KEY]: normalized });
  }
  return normalized;
}

export async function saveWilayah(config: WilayahConfig): Promise<void> {
  const result = validateWilayah(config);
  if (!result.valid) throw new Error(result.errors.join(" "));
  await chrome.storage.local.set({ [WILAYAH_KEY]: config });
}

export const storageKeys = { snapshot: SNAPSHOT_KEY, wilayah: WILAYAH_KEY } as const;
