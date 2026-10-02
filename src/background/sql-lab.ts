/** Executes in the page world with automatic top-level ORDER BY injection and 9000-row batching/pagination. */
export async function runInSqlLabAutoBatch(baseSql: string, runId: string, path: string): Promise<{ ok: boolean; message: string; columns?: string[]; rows?: unknown[][] }> {
  const runtimeWindow = window as typeof window & { __queryFlowCancelledRuns?: Record<string, boolean> };
  runtimeWindow.__queryFlowCancelledRuns ??= {};
  delete runtimeWindow.__queryFlowCancelledRuns[runId];

  function throwIfCancelled(): void {
    if (runtimeWindow.__queryFlowCancelledRuns?.[runId]) {
      throw new Error("Run dihentikan oleh pengguna.");
    }
  }
  
  // Helper to check if ORDER BY exists strictly at the top level (depth 0, outside subqueries/CTEs)
  function hasTopLevelOrderBy(sql: string): boolean {
    let depth = 0;
    const upper = sql.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (depth === 0) {
        if (upper.substring(i, i + 8) === 'ORDER BY') {
          return true;
        }
      }
    }
    return false;
  }

  // Keep an explicit outer ORDER BY. Otherwise use the first output column by
  // position: guessing an identifier from a CTE/SELECT expression can reference
  // a column that is not exposed by the outer query.
  function ensureOrderBy(sql: string): string {
    if (hasTopLevelOrderBy(sql)) {
      return sql; // Outer/main query already has a top-level ORDER BY
    }

    const modified = sql.trim().replace(/;$/, "");
    return `${modified} ORDER BY 1 ASC`;
  }

  // Preserve high-precision SQL values before executeScript's structured clone
  // strips the BigNumber/Decimal prototype and leaves only fields such as c/e/s.
  function normalizeResultValue(value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    if (!value || typeof value !== "object") return value;

    const candidate = value as { c?: unknown; e?: unknown; s?: unknown; toString?: () => string };
    const isHighPrecisionNumber = Array.isArray(candidate.c)
      && typeof candidate.e === "number"
      && (candidate.s === 1 || candidate.s === -1);
    if (!isHighPrecisionNumber || typeof candidate.toString !== "function") return value;

    const rendered = candidate.toString();
    return rendered === "[object Object]" ? value : rendered;
  }

  // Apply the intelligent top-level ORDER BY check before starting pagination loops
  const preparedSql = ensureOrderBy(baseSql);
  let allRows: unknown[][] = [];
  let columns: string[] = [];
  let offset = 0;
  const limit = 9000;
  const cleanSql = preparedSql.trim().replace(/;$/, "");

  function reportProgress(state: "running" | "completed", iteration: number, rowsCollected: number, batchRows?: number): void {
    window.postMessage({
      source: "queryflow-sql-run-progress",
      progress: { runId, path, iteration, state, rowsCollected, batchRows },
    }, window.location.origin);
  }

  type Query = { id?: string; sql?: string; state?: string; errorMessage?: string; results?: { columns?: { name: string }[]; data?: Record<string, unknown>[] }; rows?: number };
  type Store = { getState(): { sqlLab?: { queries?: Record<string, Query> } } };

  while (true) {
    const iteration = Math.floor(offset / limit) + 1;
    const paginatedSql = `${cleanSql} LIMIT ${limit} OFFSET ${offset};`;
    reportProgress("running", iteration, allRows.length);

    try {
      throwIfCancelled();
      let store: Store | undefined;
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
      if (!store) throw new Error("State hasil SQL Lab belum dikenali. Run dibatalkan.");

      const before = { ...store.getState().sqlLab?.queries };
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
      if (!editor) throw new Error("Editor SQL Lab belum dapat diakses.");

      const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(visible);
      if (buttons.some((button) => /^stop(?: query)?$/i.test(button.textContent?.trim() ?? ""))) {
        throw new Error("Query masih berjalan. Tunggu selesai.");
      }

      editor.setValue(paginatedSql, -1);
      editor.clearSelection();
      
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const run = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .filter(visible).filter((button) => /^run(?: query)?$/i.test(button.textContent?.trim() ?? ""));
      if (run.length !== 1 || !run[0] || run[0].disabled) throw new Error("RUN belum siap.");
      
      run[0].click();

      const deadline = Date.now() + 240_000;
      let queryId: string | undefined;
      let batchColumns: string[] = [];
      let batchRows: unknown[][] = [];

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        throwIfCancelled();
        const queries = store.getState().sqlLab?.queries ?? {};
        if (!queryId) {
          const candidates = Object.entries(queries).filter(([id, query]) => !before[id] && query.sql?.trim() === paginatedSql.trim());
          queryId = candidates[0]?.[0];
        }

        const query = queryId ? queries[queryId] : undefined;
        if (!query) continue;
        if (["failed", "stopped", "timed_out"].includes(query.state ?? "")) throw new Error(query.errorMessage ?? `Query ${query.state}`);
        if (query.state !== "success") continue;

        const cols = query.results?.columns?.map((column) => column.name);
        const data = query.results?.data;
        if (!cols || !Array.isArray(data)) continue;

        batchColumns = cols;
        batchRows = data.map((row) => cols.map((name) => normalizeResultValue(row[name] ?? null)));
        break;
      }

      if (!queryId) throw new Error("Batas tunggu 4 menit tercapai atau query tidak terpantau.");

      if (columns.length === 0) {
        columns = batchColumns;
      }

      allRows = allRows.concat(batchRows);
      reportProgress("completed", iteration, allRows.length, batchRows.length);

      // If results are less than the limit, we've reached the end of the data
      if (batchRows.length < limit) {
        break;
      }

      // Increment offset for the next batch loop
      offset += limit;

    } catch (error) {
      delete runtimeWindow.__queryFlowCancelledRuns?.[runId];
      return { ok: false, message: error instanceof Error ? error.message : "Run gagal." };
    }
  }

  delete runtimeWindow.__queryFlowCancelledRuns?.[runId];
  return {
    ok: true,
    message: `Query selesai dengan total ${allRows.length} baris diambil.`,
    columns,
    rows: allRows
  };
}

/** Marks a QueryFlow run as cancelled and presses SQL Lab's visible Stop button when available. */
export function stopSqlLabRun(runId: string): { ok: true; message: string } {
  const runtimeWindow = window as typeof window & { __queryFlowCancelledRuns?: Record<string, boolean> };
  runtimeWindow.__queryFlowCancelledRuns ??= {};
  runtimeWindow.__queryFlowCancelledRuns[runId] = true;

  const visible = (element: HTMLElement): boolean => element.getClientRects().length > 0;
  const stopButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .filter(visible)
    .find((button) => /^stop(?: query)?$/i.test(button.textContent?.trim() ?? ""));
  stopButton?.click();

  return {
    ok: true,
    message: stopButton ? "Menghentikan query aktif…" : "Permintaan stop dikirim…",
  };
}
