import type { QueryGroup, RepositorySnapshot, SqlFile } from "../../types";

function isSqlFile(value: unknown): value is SqlFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return typeof file.name === "string" && typeof file.path === "string" && typeof file.content === "string" && /\.sql$/i.test(file.path);
}

function isGroup(value: unknown): value is QueryGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Record<string, unknown>;
  return typeof group.name === "string" && typeof group.path === "string" && Array.isArray(group.files) && group.files.every(isSqlFile);
}

export function validateSnapshot(value: unknown): value is RepositorySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.groups) || !snapshot.groups.every(isGroup)) return false;
  const repository = snapshot.repository;
  if (!repository || typeof repository !== "object") return false;
  const info = repository as Record<string, unknown>;
  const actualCount = snapshot.groups.reduce<number>((sum, group) => sum + (group as QueryGroup).files.length, 0);
  return (
    typeof info.name === "string" &&
    typeof info.namespace === "string" &&
    typeof info.branch === "string" &&
    (info.commit === undefined || typeof info.commit === "string") &&
    typeof info.syncedAt === "string" &&
    !Number.isNaN(Date.parse(info.syncedAt)) &&
    typeof info.sqlCount === "number" &&
    info.sqlCount === actualCount
  );
}
