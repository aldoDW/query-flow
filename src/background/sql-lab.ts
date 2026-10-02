/** Executes in the page world with automatic top-level ORDER BY injection and 9000-row batching/pagination. */
export async function runInSqlLabAutoBatch(baseSql: string): Promise<{ ok: boolean; message: string; columns?: string[]; rows?: unknown[][] }> {
  
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

  // Helper function to intelligently ensure a top-level ORDER BY clause exists for safe pagination
  function ensureOrderBy(sql: string): string {
    if (hasTopLevelOrderBy(sql)) {
      return sql; // Outer/main query already has a top-level ORDER BY
    }

    let modified = sql.trim().replace(/;$/, "");

    // 1. Check for top-level GROUP BY (depth 0)
    let depth = 0;
    let groupByIndex = -1;
    const upper = modified.toUpperCase();
    
    for (let i = 0; i < upper.length - 8; i++) {
      const char = upper[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (depth === 0 && upper.substring(i, i + 8) === 'GROUP BY') {
        groupByIndex = i;
        break;
      }
    }

    if (groupByIndex !== -1) {
      const remainder = modified.substring(groupByIndex + 8).trim();
      // Changed [^\n;]+? to [\s\S]+? so it can read multi-line GROUP BY blocks safely
      const groupColMatch = remainder.match(/^([\s\S]+?)(?=\bHAVING\b|\bLIMIT\b|\bOFFSET\b|$)/i);
      if (groupColMatch && groupColMatch[1]) {
        const groupCols = groupColMatch[1].trim();
        return `${modified} ORDER BY ${groupCols} ASC`;
      }
    }

    // 2. Safe SELECT Scanner: Scan for identifiers containing 'wilayah', 'full_code', or 'kode'
    // Works reliably even with COALESCE, multi-line formatting, and table aliases (e.g., a.level_1_full_code)
    const selectMatch = modified.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i);
    if (selectMatch && selectMatch[1]) {
      const selectBlock = selectMatch[1];
      // Find all valid word identifiers inside the SELECT block that match our keywords
      const matches = [...selectBlock.matchAll(/\b([a-zA-Z0-9_]*(?:wilayah|full_code|kode)[a-zA-Z0-9_]*)\b/gi)];
      if (matches.length > 0 && matches[0]?.[1]) {
        const foundCol = matches[0][1];
        return `${modified} ORDER BY ${foundCol} ASC`;
      }
    }

    // 3. Fallback: Sort safely by the first column position at the outer level
    return `${modified} ORDER BY 1 ASC`;
  }

  // Apply the intelligent top-level ORDER BY check before starting pagination loops
  const preparedSql = ensureOrderBy(baseSql);
  let allRows: unknown[][] = [];
  let columns: string[] = [];
  let offset = 0;
  const limit = 9000;
  const cleanSql = preparedSql.trim().replace(/;$/, "");

  type Query = { id?: string; sql?: string; state?: string; errorMessage?: string; results?: { columns?: { name: string }[]; data?: Record<string, unknown>[] }; rows?: number };
  type Store = { getState(): { sqlLab?: { queries?: Record<string, Query> } } };

  while (true) {
    const paginatedSql = `${cleanSql} LIMIT ${limit} OFFSET ${offset};`;

    try {
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
        batchRows = data.map((row) => cols.map((name) => row[name] ?? null));
        break;
      }

      if (!queryId) throw new Error("Batas tunggu 4 menit tercapai atau query tidak terpantau.");

      if (columns.length === 0) {
        columns = batchColumns;
      }

      allRows = allRows.concat(batchRows);

      // If results are less than the limit, we've reached the end of the data
      if (batchRows.length < limit) {
        break;
      }

      // Increment offset for the next batch loop
      offset += limit;

    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Run gagal." };
    }
  }

  return {
    ok: true,
    message: `Query selesai dengan total ${allRows.length} baris diambil.`,
    columns,
    rows: allRows
  };
}