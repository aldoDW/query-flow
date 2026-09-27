import ExcelJS from "exceljs";

export function sheetName(filename: string, used: string[], title = ""): string {
  const suffix = filename.replace(/\.sql$/i, "").split("_").at(-1) ?? "Hasil";
  const label = `Tabel ${suffix.replace(/^tabel\s*/i, "").toUpperCase()}`;
  const base = `${label}${title.trim() ? ` - ${title.trim()}` : ""}`
    .replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ")
    .slice(0, 31).replace(/'+$/g, "").trimEnd();
  let name = base;
  let index = 2;
  while (used.some((value) => value.toLowerCase() === name.toLowerCase())) {
    const tail = ` (${index++})`;
    name = base.slice(0, 31 - tail.length) + tail;
  }
  return name;
}

export interface QueryResult {
  filename: string;
  title: string;
  columns: string[];
  rows: unknown[][];
}

export function buildWorkbook(results: QueryResult[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const used: string[] = [];
  for (const result of results) {
    const name = sheetName(result.filename, used, result.title);
    used.push(name);
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([result.title]);
    if (result.columns.length > 1) sheet.mergeCells(1, 1, 1, result.columns.length);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.addRow(result.columns);
    for (const row of result.rows) sheet.addRow(row.map((value) => value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : JSON.stringify(value)));
    sheet.getRow(2).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 2 }];
    sheet.columns.forEach((column) => { column.width = 24; });
  }
  return workbook;
}

export function workbookFilename(path: string): string {
  const folder = path.replace(/\/+$/, "").split("/").at(-1) || "Query";
  return `Hasil_${folder.replace(/[^a-z0-9_-]/gi, "_")}.xlsx`;
}

export async function exportFolder(path: string, results: QueryResult[]): Promise<void> {
  const workbook = buildWorkbook(results);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = workbookFilename(path);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
