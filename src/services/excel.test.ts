import { expect, it } from "vitest";
import { buildWorkbook, sheetName } from "./excel";

it("names sheets using the final underscore segment", () => {
  expect(sheetName("Agregat_1a.sql", [])).toBe("Tabel 1A");
  expect(sheetName("rantabF_tabel1.sql", [])).toBe("Tabel 1");
  expect(sheetName("Agregat_1a.sql", ["Tabel 1A"])).toBe("Tabel 1A (2)");
  expect(sheetName("x_" + "a".repeat(40) + ".sql", [])).toHaveLength(31);
});

it("writes the SQL title on row 1 and column headers on row 2", async () => {
  const workbook = buildWorkbook([{ filename: "tabel1.sql", title: "Judul Tabel 1", columns: ["wilayah", "total"], rows: [["3507", 10]] }]);
  const sheet = workbook.worksheets[0];
  expect(sheet?.getCell("A1").value).toBe("Judul Tabel 1");
  expect(sheet?.getCell("A2").value).toBe("wilayah");
  expect(sheet?.getCell("B2").value).toBe("total");
});
