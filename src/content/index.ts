import { GitLabAdapter } from "./gitlab/adapter";
import type { ExtensionMessage, ScanResult, SqlRunProgress, SyncProgress } from "../types";

const SQL_PROGRESS_SOURCE = "queryflow-sql-run-progress";

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || !event.data || typeof event.data !== "object") return;
  const data = event.data as { source?: unknown; progress?: unknown };
  if (data.source !== SQL_PROGRESS_SOURCE || !data.progress || typeof data.progress !== "object") return;
  const progress = data.progress as Partial<SqlRunProgress>;
  if (typeof progress.runId !== "string" || typeof progress.path !== "string" || typeof progress.iteration !== "number") return;
  void chrome.runtime.sendMessage({ type: "SQL_RUN_PROGRESS", progress: progress as SqlRunProgress } satisfies ExtensionMessage).catch(() => undefined);
});

function report(progress: SyncProgress): void {
  void chrome.runtime.sendMessage({ type: "SYNC_PROGRESS", progress } satisfies ExtensionMessage).catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== "GITLAB_SCAN") return false;
  const adapter = new GitLabAdapter(report);
  void adapter
    .scanSqlGroups()
    .then((snapshot) => sendResponse({ ok: true, snapshot } satisfies ScanResult))
    .catch((error: unknown) =>
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Sinkronisasi gagal." } satisfies ScanResult),
    );
  return true;
});
