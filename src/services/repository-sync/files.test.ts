import { describe, expect, it } from "vitest";
import { groupSqlFiles, isSqlPath } from "./files";

describe("SQL file discovery", () => {
  it("filters SQL extensions case-insensitively", () => {
    expect(isSqlPath("folder/query.sql")).toBe(true);
    expect(isSqlPath("folder/QUERY.SQL")).toBe(true);
    expect(isSqlPath("folder/query.sql.txt")).toBe(false);
  });

  it("groups only directly contained SQL files by their folder", () => {
    const groups = groupSqlFiles([
      { name: "template.sql", path: "template.sql", content: "excluded root" },
      { name: "a.sql", path: "Agregat/A/a.sql", content: "select 1" },
      { name: "b.sql", path: "Agregat/A/child/b.sql", content: "select 2" },
      { name: "c.txt", path: "Agregat/A/c.txt", content: "ignored" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: "A", path: "Agregat/A" });
    expect(groups[0]?.files.map((file) => file.name)).toEqual(["a.sql"]);
    expect(groups[1]).toMatchObject({ name: "child", path: "Agregat/A/child" });
  });
});
