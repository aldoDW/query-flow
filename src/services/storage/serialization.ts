import type { RepositorySnapshot } from "../../types";
import { validateSnapshot } from "./validation";

/** Storage boundary kept explicit so the backend can later move to IndexedDB. */
export function serializeSnapshot(snapshot: RepositorySnapshot): RepositorySnapshot {
  if (!validateSnapshot(snapshot)) throw new Error("Snapshot repository tidak valid.");
  return structuredClone(snapshot);
}

export function deserializeSnapshot(value: unknown): RepositorySnapshot | null {
  return validateSnapshot(value) ? structuredClone(value) : null;
}
