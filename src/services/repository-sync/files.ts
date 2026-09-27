import type { QueryGroup, SqlFile } from "../../types";
import { compareFilenames } from "../../utils/filename-order";

export function isSqlPath(path: string): boolean {
  return /\.sql$/i.test(path.trim());
}

export function groupSqlFiles(files: SqlFile[]): QueryGroup[] {
  const folders = new Map<string, SqlFile[]>();

  for (const file of files) {
    if (!isSqlPath(file.path)) continue;
    const separator = file.path.lastIndexOf("/");
    if (separator < 1) continue;
    const folderPath = separator >= 0 ? file.path.slice(0, separator) : ".";
    const current = folders.get(folderPath) ?? [];
    current.push(file);
    folders.set(folderPath, current);
  }

  return [...folders.entries()]
    .map(([path, groupFiles]) => ({
      name: path === "." ? "Root" : (path.split("/").at(-1) ?? path),
      path,
      files: [...groupFiles].sort((a, b) => compareFilenames(a.name, b.name)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
