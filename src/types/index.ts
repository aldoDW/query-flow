export const TARGET = {
  origin: "https://git.bps.go.id",
  namespace: "rafifhasabi",
  repository: "query-cleaning-data-sensus-ekonomi-2026",
  defaultBranch: "main",
} as const;

export interface SqlFile {
  name: string;
  path: string;
  content: string;
}

export interface QueryGroup {
  name: string;
  path: string;
  files: SqlFile[];
}

export interface RepositoryInfo {
  name: string;
  namespace: string;
  branch: string;
  commit?: string;
  syncedAt: string;
  sqlCount: number;
}

export interface RepositorySnapshot {
  version: 1;
  repository: RepositoryInfo;
  groups: QueryGroup[];
}

export interface WilayahConfig {
  level1: string[];
  level2: string[];
}

export type SyncPhase =
  | "idle"
  | "connecting"
  | "scanning"
  | "reading"
  | "saving"
  | "success"
  | "error";

export interface SyncProgress {
  phase: SyncPhase;
  message: string;
  current?: number;
  total?: number;
}

export type ExtensionMessage =
  | { type: "RUN_SQL_FILE"; path: string; capture?: boolean; tabId?: number }
  | { type: "SYNC_REPOSITORY" }
  | { type: "SYNC_PROGRESS"; progress: SyncProgress }
  | { type: "GITLAB_SCAN" };

export type ScanResult =
  | { ok: true; snapshot: RepositorySnapshot }
  | { ok: false; error: string };
