import { saveSnapshot } from "../services/storage";
import { loadSnapshot, loadWilayah } from "../services/storage";
import { applyWilayahConfig } from "../services/sql";
import { runInSqlLabAutoBatch } from "./sql-lab";
import { TARGET, type ExtensionMessage, type ScanResult } from "../types";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "RUN_SQL_FILE") {
    void (async () => {
      try {
        const snapshot = await loadSnapshot();
        const file = snapshot?.groups.flatMap((group) => group.files).find((file) => file.path === message.path);
        if (!file) throw new Error("File SQL tidak ditemukan dalam cache.");
        const wilayah = await loadWilayah();
        const sql = applyWilayahConfig(file.content, wilayah);
        const tab = message.tabId !== undefined ? await chrome.tabs.get(message.tabId) : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
        if (tab?.id === undefined) throw new Error("Buka tab SQL Lab terlebih dahulu.");
        const targetUrl = new URL(tab.url ?? "about:blank");
        if (targetUrl.origin !== "https://fasih-dashboard.bps.go.id" || !/^\/superset\/sqllab\/?$/.test(targetUrl.pathname)) {
          throw new Error("Aktifkan tab FASIH SQL Lab (/superset/sqllab/) lalu pilih Run kembali.");
        }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id }, 
          world: "MAIN", 
          func: runInSqlLabAutoBatch, // Automatically handles LIMIT/OFFSET loops if rows == 9000
          args: [sql], // message.capture is implied/handled inside the auto-batching wrapper
        });
        if (!result[0]?.result) throw new Error("Tidak ada respons dari SQL Lab. Periksa editor dan tombol RUN.");
        sendResponse(result[0].result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Run gagal.";
        sendResponse({ ok: false, message: /Cannot access|permission to access/i.test(message)
          ? "Akses FASIH belum diizinkan. Reload extension versi 0.1.1 di chrome://extensions, lalu periksa Details → Site access untuk https://fasih-dashboard.bps.go.id/."
          : message });
      }
    })();
    return true;
  }
  if (message.type !== "SYNC_REPOSITORY") return false;
  void syncFromOpenTab().then(sendResponse);
  return true;
});

async function syncFromOpenTab(): Promise<ScanResult> {
  const tabs = await chrome.tabs.query({ url: `${TARGET.origin}/${TARGET.namespace}/${TARGET.repository}/*` });
  const tab = tabs.find((candidate) => candidate.id !== undefined);
  if (!tab?.id) return { ok: false, error: "Buka repository GitLab terlebih dahulu." };

  try {
    const result = await sendScanMessage(tab.id);
    if (!result.ok) return result;
    await chrome.runtime.sendMessage({
      type: "SYNC_PROGRESS",
      progress: { phase: "saving", message: "Saving snapshot..." },
    } satisfies ExtensionMessage).catch(() => undefined);
    await saveSnapshot(result.snapshot);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tidak dapat terhubung ke tab GitLab.";
    return { ok: false, error: message };
  }
}

async function sendScanMessage(tabId: number): Promise<ScanResult> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "GITLAB_SCAN" } satisfies ExtensionMessage)) as ScanResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Receiving end does not exist")) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["assets/content.js"] });
    return (await chrome.tabs.sendMessage(tabId, { type: "GITLAB_SCAN" } satisfies ExtensionMessage)) as ScanResult;
  }
}
