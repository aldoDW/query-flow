/** Executes in the page world; must remain self-contained for executeScript. */
export async function runInSqlLab(sql: string, capture = false): Promise<{ ok: boolean; message: string; columns?: string[]; rows?: unknown[][] }> {
  try {
  type Query = { id?: string; sql?: string; state?: string; errorMessage?: string; results?: { columns?: { name: string }[]; data?: Record<string, unknown>[] }; rows?: number };
  type Store = { getState(): { sqlLab?: { queries?: Record<string, Query> } } };
  let store: Store | undefined;
  if (capture) {
    // Read the existing React Provider's store, never credentials or network endpoints.
    for (const node of document.querySelectorAll("#app, #root, #app *")) {
      const key = Object.keys(node).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
      if (!key) continue;
      let fiber = (node as unknown as Record<string, unknown>)[key] as { return?: unknown; memoizedProps?: { store?: Store; value?: { store?: Store } } } | undefined;
      for (let depth = 0; fiber && depth < 100; depth++) {
        const candidate = fiber.memoizedProps?.store ?? fiber.memoizedProps?.value?.store;
        if (candidate?.getState()?.sqlLab?.queries) { store = candidate; break; }
        fiber = fiber.return as typeof fiber;
      }
      if (store) break;
    }
    if (!store) throw new Error("State hasil SQL Lab belum dikenali. Run Folder dibatalkan sebelum query dijalankan.");
  }
  const before = { ...store?.getState().sqlLab?.queries };
  const visible = (element: HTMLElement): boolean => element.getClientRects().length > 0;
  const editors = [...document.querySelectorAll<HTMLElement>(".ace_editor")].filter(visible);
  if (editors.length !== 1) throw new Error("Pilih satu tab query SQL Lab dengan editor yang terlihat.");
  const element = editors[0] as HTMLElement & {
    env?: { editor?: {
      setValue(value: string, cursor: number): void;
      getValue(): string;
      clearSelection(): void;
    } };
  };
  const editor = element.env?.editor;
  if (!editor) throw new Error("Editor SQL Lab belum dapat diakses. Tunggu halaman selesai dimuat.");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(visible);
  const runButtons = buttons.filter((button) => /^run(?: query)?$/i.test(button.textContent?.trim() ?? ""));
  if (runButtons.length !== 1) throw new Error("Tombol RUN SQL Lab tidak dapat dikenali secara unik.");
  if (buttons.some((button) => /^stop(?: query)?$/i.test(button.textContent?.trim() ?? ""))) {
    throw new Error("Query masih berjalan. Tunggu selesai sebelum menjalankan file berikutnya.");
  }
  editor.setValue(sql, -1);
  editor.clearSelection();
  if (editor.getValue() !== sql) throw new Error("Isi editor tidak sesuai SQL yang dipilih; RUN dibatalkan.");
  // Allow the editor's change handler to update the SQL Lab state before clicking.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const run = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .filter(visible).filter((button) => /^run(?: query)?$/i.test(button.textContent?.trim() ?? ""));
  if (run.length !== 1 || !run[0] || run[0].disabled) throw new Error("RUN belum siap. SQL sudah terisi di editor.");
  run[0].click();
  if (capture && store) {
    const deadline = Date.now() + 240_000;
    let queryId: string | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const queries = store.getState().sqlLab?.queries ?? {};
      if (!queryId) {
        const candidates = Object.entries(queries).filter(([id, query]) => !before[id] && query.sql?.trim() === sql.trim());
        if (candidates.length > 1) throw new Error("Lebih dari satu query baru terdeteksi; batch dihentikan.");
        queryId = candidates[0]?.[0];
      }
      const query = queryId ? queries[queryId] : undefined;
      if (!query) continue;
      if (["failed", "stopped", "timed_out"].includes(query.state ?? "")) throw new Error(query.errorMessage ?? `Query ${query.state}`);
      if (query.state !== "success") continue;
      const columns = query.results?.columns?.map((column) => column.name);
      const data = query.results?.data;
      if (!columns || !Array.isArray(data)) continue;
      if (typeof query.rows === "number" && query.rows !== data.length) throw new Error("Hasil belum lengkap di SQL Lab; ekspor dibatalkan agar tidak kehilangan baris.");
      return { ok: true, message: "Query selesai", columns, rows: data.map((row) => columns.map((name) => row[name] ?? null)) };
    }
    throw new Error("Batas tunggu 4 menit tercapai. Batch berhenti; periksa query di SQL Lab sebelum mencoba lagi.");
  }
  return { ok: true, message: "RUN dikirim. Lihat hasil atau error di SQL Lab." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Run gagal." };
  }
}
