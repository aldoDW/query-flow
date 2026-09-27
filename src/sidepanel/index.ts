import "./style.css";
import { exportFolder } from "../services/excel";
import { extractSqlTitle } from "../services/sql";

let folderRunning = false;
import { loadSnapshot, loadWilayah, saveSnapshot, saveWilayah } from "../services/storage";
import { groupSqlFiles, isSqlPath } from "../services/repository-sync/files";
import { addWilayahCode, validateWilayah } from "../services/wilayah";
import { TARGET, type ExtensionMessage, type RepositorySnapshot, type ScanResult, type SqlFile, type SyncProgress, type WilayahConfig } from "../types";

let snapshot: RepositorySnapshot | null = null;
let wilayah: WilayahConfig = { level1: [], level2: [] };
let progress: SyncProgress = { phase: "idle", message: "Not synced" };
let wilayahError = "";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App container is missing.");

app.innerHTML = `
  <main class="panel">
    <header class="app-header">
      <span class="eyebrow">Chrome Extension</span>
      <h1>QueryFlow</h1>
      <p class="field-note">Integrasi · FASIH SQL Lab</p>
      <p class="field-note">Case 1 · SE2026 — Sensus Ekonomi 2026</p>
    </header>
    <section class="section" aria-labelledby="source-title">
      <div class="section-heading"><span>01</span><h2 id="source-title">Sumber SQL</h2></div>
      <div class="source-card">
        <p id="source-name" class="source-name">Belum ada folder SQL</p>
        <dl class="metadata">
          <div><dt>Branch</dt><dd id="branch">main</dd></div>
          <div><dt>Status</dt><dd id="status" class="status">Belum diimpor</dd></div>
          <div><dt>Commit</dt><dd id="commit">—</dd></div>
          <div><dt>File</dt><dd id="counts">0 SQL · 0 folder</dd></div>
          <div class="wide"><dt>Terakhir diperbarui</dt><dd id="synced-at">—</dd></div>
        </dl>
        <div id="progress" class="progress" aria-live="polite"></div>
        <div class="source-actions">
          <!-- Sync from GitLab sengaja dinonaktifkan. Sumber query aktif berasal dari impor folder lokal. -->
          <button id="import-folder" class="secondary-button" type="button">Import Folder SQL</button>
          <input id="folder-input" type="file" webkitdirectory multiple hidden />
        </div>
      </div>
    </section>
    <section class="section" aria-labelledby="wilayah-title">
      <div class="section-heading"><span>02</span><h2 id="wilayah-title">Filter Wilayah</h2></div>
      <p class="field-note">Case 1 · SE2026. Berlaku pada SQL dengan parameter filter_provinsi dan filter_kabupaten.</p>
      <div class="field">
        <label>Level 1 <span>/ Provinsi · kosong berarti semua</span></label>
        <div id="level1-list" class="code-list"></div>
        <div id="add-level1-row" class="add-row" hidden>
          <input id="new-level1" inputmode="numeric" autocomplete="off" placeholder="Kode provinsi" />
          <button id="confirm-level1" type="button">Tambah</button>
        </div>
        <button id="show-level1-add" class="text-button" type="button">＋ Tambah Provinsi</button>
      </div>
      <div class="field">
        <label>Level 2 <span>/ Kabupaten/Kota · kosong berarti semua</span></label>
        <div id="level2-list" class="code-list"></div>
        <div id="add-level2-row" class="add-row" hidden>
          <input id="new-level2" inputmode="numeric" autocomplete="off" placeholder="Kode wilayah" />
          <button id="confirm-level2" type="button">Tambah</button>
        </div>
        <button id="show-level2-add" class="text-button" type="button">＋ Tambah Kabupaten/Kota</button>
      </div>
      <p id="wilayah-error" class="error" aria-live="polite"></p>
      <p id="wilayah-mode" class="field-note"></p>
      <p id="wilayah-saved" class="saved" aria-live="polite"></p>
    </section>
    <section class="section groups-section" aria-labelledby="groups-title">
      <div class="section-heading"><span>03</span><h2 id="groups-title">Folder SQL</h2></div>
      <div id="empty-groups" class="empty-state">Import folder SQL untuk melihat daftar query dan menjalankannya di FASIH SQL Lab.</div>
      <div id="groups" class="groups"></div>
    </section>
    <footer class="author-credit">by D.Agung Sungkono</footer>
  </main>
  <dialog id="preview-dialog">
    <div class="dialog-header"><div><span id="preview-path"></span><h3 id="preview-name"></h3></div><button id="close-preview" aria-label="Tutup">×</button></div>
    <pre id="preview-content"></pre>
  </dialog>
`;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const syncButton = document.querySelector<HTMLButtonElement>("#sync");
const importButton = byId<HTMLButtonElement>("import-folder");
const folderInput = byId<HTMLInputElement>("folder-input");
const newLevel1Input = byId<HTMLInputElement>("new-level1");
const newLevel2Input = byId<HTMLInputElement>("new-level2");

async function initialize(): Promise<void> {
  [snapshot, wilayah] = await Promise.all([loadSnapshot(), loadWilayah()]);
  progress = snapshot
    ? { phase: "success", message: snapshot.repository.namespace === "local-folder" ? "Imported" : "Synced" }
    : { phase: "idle", message: "Belum diimpor" };
  render();
}

function render(): void {
  renderSource();
  renderWilayah();
  renderGroups();
}

function renderSource(): void {
  byId("source-name").textContent = snapshot?.repository.name ?? "Belum ada folder SQL";
  byId("branch").textContent = snapshot?.repository.branch ?? TARGET.defaultBranch;
  const status = byId("status");
  status.textContent = progress.phase === "success" ? `✓ ${progress.message}` : progress.message;
  status.className = `status status-${progress.phase}`;
  byId("commit").textContent = snapshot?.repository.commit?.slice(0, 8) ?? "—";
  byId("counts").textContent = `${snapshot?.repository.sqlCount ?? 0} SQL · ${snapshot?.groups.length ?? 0} folder`;
  byId("synced-at").textContent = snapshot ? formatDate(snapshot.repository.syncedAt) : "—";
  const progressElement = byId("progress");
  const showDetail = !["idle", "success"].includes(progress.phase);
  progressElement.textContent = showDetail
    ? `${progress.message}${progress.phase === "error" && snapshot ? " Last successful snapshot preserved." : ""}`
    : "";
  progressElement.classList.toggle("progress-error", progress.phase === "error");
  const busy = ["connecting", "scanning", "reading", "saving"].includes(progress.phase);
  if (syncButton) syncButton.disabled = busy;
  importButton.disabled = busy;
}

function renderWilayah(): void {
  renderCodeList("level1-list", "Level 1", wilayah.level1, (index, code) => updateCode("level1", index, code), (index) => removeCode("level1", index));
  renderCodeList("level2-list", "Level 2", wilayah.level2, (index, code) => updateCode("level2", index, code), (index) => removeCode("level2", index));
  byId("wilayah-error").textContent = wilayahError;
  byId("wilayah-mode").textContent = wilayah.level2.length > 0 && wilayah.level1.length > 0
    ? "Filter aktif: Kabupaten/Kota. Daftar provinsi diabaikan selama Level 2 terisi."
    : wilayah.level2.length > 0
      ? "Filter aktif: Kabupaten/Kota."
      : wilayah.level1.length > 0
        ? "Filter aktif: seluruh Kabupaten/Kota dalam provinsi terpilih."
        : "Filter wilayah kosong: semua wilayah akan dijalankan.";
}

function renderCodeList(
  elementId: string,
  label: string,
  codes: string[],
  update: (index: number, code: string) => void,
  removeCodeAt: (index: number) => void,
): void {
  const list = byId(elementId);
  list.replaceChildren();
  codes.forEach((code, index) => {
    const row = document.createElement("div");
    row.className = "code-row";
    const input = document.createElement("input");
    input.inputMode = "numeric";
    input.value = code;
    input.setAttribute("aria-label", `Kode ${label} ${index + 1}`);
    input.addEventListener("change", () => update(index, input.value));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Hapus ${code}`);
    remove.addEventListener("click", () => removeCodeAt(index));
    row.append(input, remove);
    list.append(row);
  });
}

function renderGroups(): void {
  const groupsElement = byId("groups");
  groupsElement.replaceChildren();
  byId("empty-groups").hidden = Boolean(snapshot?.groups.length);
  for (const group of snapshot?.groups ?? []) {
    const details = document.createElement("details");
    details.className = "group";
    const summary = document.createElement("summary");
    const heading = document.createElement("span");
    heading.className = "group-name";
    const repeatedName = (snapshot?.groups ?? []).filter((candidate) => candidate.name === group.name).length > 1;
    heading.textContent = repeatedName ? group.path.replaceAll("/", " / ") : group.name;
    const meta = document.createElement("span");
    meta.className = "group-count";
    meta.textContent = `${group.path} · ${group.files.length} SQL file${group.files.length === 1 ? "" : "s"}`;
    summary.append(heading, meta);
    const files = document.createElement("div");
    files.className = "file-list";
    const batch = document.createElement("button");
    batch.textContent = "▶ Run Folder → Excel";
    batch.className = "secondary-button";
    const batchStatus = document.createElement("p");
    batchStatus.className = "progress";
    batchStatus.setAttribute("role", "status");
    batch.addEventListener("click", async () => {
      if (folderRunning) return;
      folderRunning = true;
      batch.disabled = true;
      const results: { filename: string; title: string; columns: string[]; rows: unknown[][] }[] = [];
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id === undefined) throw new Error("Aktifkan tab FASIH SQL Lab.");
        for (const [index, file] of group.files.entries()) {
          batchStatus.textContent = `${index + 1}/${group.files.length}: ${file.name} — menunggu hasil. Tetap buka panel dan tab query ini.`;
          const response = await chrome.runtime.sendMessage({ type: "RUN_SQL_FILE", path: file.path, tabId: tab.id, capture: true } satisfies ExtensionMessage) as { ok: boolean; message: string; columns?: string[]; rows?: unknown[][] };
          if (!response.ok || !response.columns || !response.rows) throw new Error(`${file.name}: ${response.message}`);
          results.push({ filename: file.name, title: extractSqlTitle(file.content, file.name), columns: response.columns, rows: response.rows });
        }
        await exportFolder(group.path, results);
        batchStatus.textContent = `Selesai: ${results.length} sheet. Excel diunduh. Hasil mengikuti LIMIT SQL Lab.`;
      } catch (error) {
        batchStatus.textContent = `Batch berhenti; Excel belum dibuat. ${error instanceof Error ? error.message : "Run gagal."}`;
      } finally {
        folderRunning = false;
        batch.disabled = false;
      }
    });
    files.append(batch, batchStatus);
    for (const file of group.files) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = file.name;
      button.addEventListener("click", () => showPreview(file.name, file.path, file.content));
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "minmax(0, 1fr) auto";
      const run = document.createElement("button");
      run.type = "button";
      run.textContent = "▶ Run";
      run.title = "Ganti isi editor SQL Lab aktif dan jalankan SQL asli file ini";
      const status = document.createElement("p");
      status.className = "progress";
      status.setAttribute("role", "status");
      run.addEventListener("click", async () => {
        if (folderRunning) { status.textContent = "Tunggu Run Folder selesai."; return; }
        run.disabled = true;
        status.textContent = "Mengirim SQL ke editor aktif...";
        try {
          const response = await chrome.runtime.sendMessage({ type: "RUN_SQL_FILE", path: file.path } satisfies ExtensionMessage) as { ok: boolean; message: string };
          status.textContent = response.message;
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Run gagal.";
        } finally {
          run.disabled = false;
        }
      });
      row.append(button, run);
      files.append(row, status);
    }
    details.append(summary, files);
    groupsElement.append(details);
  }
}

async function persistWilayah(next: WilayahConfig): Promise<boolean> {
  const validation = validateWilayah(next);
  if (!validation.valid) {
    wilayahError = validation.errors[0] ?? "Konfigurasi wilayah tidak valid.";
    byId("wilayah-error").textContent = wilayahError;
    return false;
  }
  wilayah = next;
  wilayahError = "";
  await saveWilayah(wilayah);
  byId("wilayah-error").textContent = "";
  const saved = byId("wilayah-saved");
  saved.textContent = "Tersimpan";
  window.setTimeout(() => (saved.textContent = ""), 1200);
  return true;
}

async function updateCode(level: keyof WilayahConfig, index: number, code: string): Promise<void> {
  const next = [...wilayah[level]];
  next[index] = code.trim();
  await persistWilayah({ ...wilayah, [level]: next });
  renderWilayah();
}

async function removeCode(level: keyof WilayahConfig, index: number): Promise<void> {
  await persistWilayah({ ...wilayah, [level]: wilayah[level].filter((_, candidate) => candidate !== index) });
  renderWilayah();
}

async function confirmAdd(level: keyof WilayahConfig, input: HTMLInputElement, rowId: string): Promise<void> {
  const code = input.value.trim();
  const next = addWilayahCode(wilayah, level, code);
  if (next === wilayah) {
    const label = level === "level1" ? "Level 1" : "Level 2";
    wilayahError = wilayah[level].includes(code) ? `Kode ${label} tidak boleh duplikat.` : `Kode ${label} harus berisi angka.`;
    renderWilayah();
    return;
  }
  await persistWilayah(next);
  input.value = "";
  byId(rowId).hidden = true;
  renderWilayah();
}

function showPreview(name: string, path: string, content: string): void {
  byId("preview-name").textContent = name;
  byId("preview-path").textContent = path;
  byId("preview-content").textContent = content;
  byId<HTMLDialogElement>("preview-dialog").showModal();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

// Handler dipertahankan agar fitur GitLab dapat diaktifkan kembali cukup dengan
// mengembalikan tombol #sync pada template di atas.
syncButton?.addEventListener("click", async () => {
  progress = { phase: "connecting", message: "Connecting to GitLab..." };
  renderSource();
  try {
    const result = (await chrome.runtime.sendMessage({ type: "SYNC_REPOSITORY" } satisfies ExtensionMessage)) as ScanResult;
    if (!result.ok) throw new Error(result.error);
    snapshot = result.snapshot;
    progress = { phase: "success", message: "Synced" };
    render();
  } catch (error) {
    progress = { phase: "error", message: error instanceof Error ? error.message : "Sync failed" };
    renderSource();
  }
});

importButton.addEventListener("click", () => folderInput.click());
folderInput.addEventListener("change", () => void importRepositoryFolder(folderInput.files));

async function importRepositoryFolder(fileList: FileList | null): Promise<void> {
  if (!fileList?.length) return;
  const selected = [...fileList];
  const sqlFiles = selected.filter((file) => isSqlPath(file.name) && file.webkitRelativePath.split("/").length > 2);
  if (sqlFiles.length === 0) {
    progress = { phase: "error", message: "Tidak ada SQL dalam subfolder. SQL di root diabaikan; pilih folder repository yang membungkus query groups." };
    renderSource();
    folderInput.value = "";
    return;
  }

  const firstPath = selected[0]?.webkitRelativePath || selected[0]?.name || "repository";
  const rootFolder = firstPath.split("/")[0] || "repository";
  try {
    const importedFiles: SqlFile[] = [];
    for (const [index, file] of sqlFiles.entries()) {
      progress = {
        phase: "reading",
        message: `Reading ${index + 1} / ${sqlFiles.length} SQL files...`,
        current: index + 1,
        total: sqlFiles.length,
      };
      renderSource();
      const fullPath = file.webkitRelativePath || file.name;
      const relativePath = fullPath.startsWith(`${rootFolder}/`) ? fullPath.slice(rootFolder.length + 1) : fullPath;
      importedFiles.push({ name: file.name, path: relativePath, content: await file.text() });
    }

    const nextSnapshot: RepositorySnapshot = {
      version: 1,
      repository: {
        name: rootFolder,
        namespace: "local-folder",
        branch: "local import",
        syncedAt: new Date().toISOString(),
        sqlCount: importedFiles.length,
      },
      groups: groupSqlFiles(importedFiles),
    };
    progress = { phase: "saving", message: "Mengganti seluruh cache SQL dengan folder impor terbaru..." };
    renderSource();
    await saveSnapshot(nextSnapshot);
    snapshot = nextSnapshot;
    progress = { phase: "success", message: "Imported — cache lama diganti" };
    render();
  } catch (error) {
    progress = { phase: "error", message: error instanceof Error ? error.message : "Import folder gagal." };
    renderSource();
  } finally {
    folderInput.value = "";
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== "SYNC_PROGRESS") return;
  progress = message.progress;
  renderSource();
});

byId("show-level1-add").addEventListener("click", () => {
  byId("add-level1-row").hidden = false;
  newLevel1Input.focus();
});
byId("confirm-level1").addEventListener("click", () => void confirmAdd("level1", newLevel1Input, "add-level1-row"));
newLevel1Input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void confirmAdd("level1", newLevel1Input, "add-level1-row");
});
byId("show-level2-add").addEventListener("click", () => {
  byId("add-level2-row").hidden = false;
  newLevel2Input.focus();
});
byId("confirm-level2").addEventListener("click", () => void confirmAdd("level2", newLevel2Input, "add-level2-row"));
newLevel2Input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void confirmAdd("level2", newLevel2Input, "add-level2-row");
});
byId("close-preview").addEventListener("click", () => byId<HTMLDialogElement>("preview-dialog").close());

void initialize();
