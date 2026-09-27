import { GitLabAdapter } from "./gitlab/adapter";
import type { ExtensionMessage, ScanResult, SyncProgress } from "../types";

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
