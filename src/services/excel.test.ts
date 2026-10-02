import { expect, it } from "vitest";
import { bigNumberPartsToDecimal, buildWorkbook, sheetName } from "./excel";

it("uses the SQL title directly as the sheet name", () => {
  expect(sheetName("Agregat_1a.sql", [], "Jumlah Usaha")).toBe("Jumlah Usaha");
  expect(sheetName("rantabF_tabel1.sql", [], "Jumlah Tenaga Kerja")).toBe("Jumlah Tenaga Kerja");
  expect(sheetName("Agregat_1a.sql", ["Jumlah Usaha"], "Jumlah Usaha")).toBe("Jumlah Usaha (2)");
  expect(sheetName("x.sql", [], "a".repeat(40))).toHaveLength(31);
  expect(sheetName("Agregat_1a.sql", [])).toBe("Agregat_1a");
});

it("writes the SQL title on row 1 and column headers on row 2", async () => {
  const workbook = buildWorkbook([{ filename: "tabel1.sql", title: "Judul Tabel 1", columns: ["wilayah", "total"], rows: [["3507", 10]] }]);
  const sheet = workbook.worksheets[0];
  expect(sheet?.name).toBe("Judul Tabel 1");
  expect(sheet?.getCell("A1").value).toBe("Judul Tabel 1");
  expect(sheet?.getCell("A2").value).toBe("wilayah");
  expect(sheet?.getCell("B2").value).toBe("total");
});

it("includes titles and keeps truncated worksheet names valid and unique", async () => {
  expect(sheetName("Agregat_1a.sql", [], "Judul Tabel 1a")).toBe("Judul Tabel 1a");
  const title = "Jumlah penduduk menurut wilayah dan kategori";
  const first = sheetName("x_1.sql", [], title);
  const second = sheetName("x_1.sql", [first], title);
  expect(first.length).toBeLessThanOrEqual(31);
  expect(second.length).toBeLessThanOrEqual(31);
  expect(second).not.toBe(first);
  expect(sheetName("x_1.sql", [], "A/B: C? [D]")).not.toMatch(/[\\/*?:[\]]/);
  const workbook = buildWorkbook([{ filename: "x_1.sql", title, columns: ["n"], rows: [[1]] }]);
  await expect(workbook.xlsx.writeBuffer()).resolves.toBeDefined();
  expect(workbook.worksheets[0]?.getCell("A1").value).toBe(title);
});

it("converts serialized high-precision numbers instead of writing JSON", () => {
  expect(bigNumberPartsToDecimal({ c: [1592650473717], e: 13, s: 1 })).toBe("15926504737170");
  expect(bigNumberPartsToDecimal({ c: [123, 45600000000000], e: 2, s: 1 })).toBe("123.456");
  expect(bigNumberPartsToDecimal({ c: [12], e: -3, s: -1 })).toBe("-0.0012");

  const workbook = buildWorkbook([{
    filename: "omzet.sql",
    title: "Total Omzet",
    columns: ["metrik_total_omzet"],
    rows: [[{ c: [1592650473717], e: 13, s: 1 }]],
  }]);
  expect(workbook.worksheets[0]?.getCell("A3").value).toBe("15926504737170");
});
