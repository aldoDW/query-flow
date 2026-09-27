import type { QueryGroup, RepositorySnapshot, SqlFile, SyncProgress } from "../../types";
import { GITLAB_SELECTORS } from "./selectors";

const TARGET = {
  origin: "https://git.bps.go.id",
  namespace: "rafifhasabi",
  repository: "query-cleaning-data-sensus-ekonomi-2026",
  defaultBranch: "main",
} as const;

export function deriveRawUrl(blobUrl: string): string | null {
  const url = new URL(blobUrl);
  const marker = `/${TARGET.namespace}/${TARGET.repository}/-/blob/`;
  if (url.origin !== TARGET.origin || !url.pathname.startsWith(marker)) return null;
  url.pathname = url.pathname.replace(marker, `/${TARGET.namespace}/${TARGET.repository}/-/raw/`);
  url.searchParams.delete("viewer");
  return url.href;
}

function isSqlPath(path: string): boolean {
  return /\.sql$/i.test(path.trim());
}

function groupSqlFiles(files: SqlFile[]): QueryGroup[] {
  const folders = new Map<string, SqlFile[]>();
  for (const file of files) {
    if (!isSqlPath(file.path)) continue;
    const separator = file.path.lastIndexOf("/");
    if (separator < 1) continue;
    const path = separator >= 0 ? file.path.slice(0, separator) : ".";
    folders.set(path, [...(folders.get(path) ?? []), file]);
  }
  return [...folders.entries()]
    .map(([path, groupFiles]) => ({
      name: path === "." ? "Root" : (path.split("/").at(-1) ?? path),
      path,
      files: groupFiles.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }) || a.name.localeCompare(b.name, "en")),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

interface RepositoryEntry {
  kind: "directory" | "file";
  path: string;
  url: string;
}

type ProgressReporter = (progress: SyncProgress) => void;

export class GitLabAdapter {
  private readonly repositoryBase = `${TARGET.origin}/${TARGET.namespace}/${TARGET.repository}`;

  constructor(private readonly report: ProgressReporter) {}

  detectRepository(): boolean {
    return location.origin === TARGET.origin && this.isTargetPath(location.pathname);
  }

  async scanSqlGroups(): Promise<RepositorySnapshot> {
    if (!this.detectRepository()) throw new Error("Tab GitLab bukan repository yang dituju.");

    const branch = this.getCurrentBranch();
    const commit = this.getCurrentCommit(document);
    const rootUrl = `${this.repositoryBase}/-/tree/${encodeURIComponent(branch)}`;
    this.report({ phase: "scanning", message: "Scanning repository..." });

    const entries = (await this.listFilesFromPageIndex(branch)) ?? (await this.walkTree(rootUrl, branch));
    const sqlEntries = entries.filter((entry) => entry.kind === "file" && entry.path.includes("/") && isSqlPath(entry.path));
    if (sqlEntries.length === 0) {
      throw new Error(
        "Tidak ada file SQL yang dapat ditemukan dari halaman GitLab. Struktur DOM GitLab internal mungkin perlu disesuaikan di GitLabAdapter.",
      );
    }

    const files: SqlFile[] = [];
    for (const [index, entry] of sqlEntries.entries()) {
      this.report({
        phase: "reading",
        message: `Reading ${index + 1} / ${sqlEntries.length} SQL files...`,
        current: index + 1,
        total: sqlEntries.length,
      });
      files.push({
        name: entry.path.split("/").at(-1) ?? entry.path,
        path: entry.path,
        content: await this.getFileContent(entry.url),
      });
    }

    const groups = groupSqlFiles(files);
    return {
      version: 1,
      repository: {
        name: TARGET.repository,
        namespace: TARGET.namespace,
        branch,
        commit,
        syncedAt: new Date().toISOString(),
        sqlCount: files.length,
      },
      groups,
    };
  }

  getCurrentBranch(): string {
    for (const selector of GITLAB_SELECTORS.branch) {
      const element = document.querySelector(selector);
      const value = element?.getAttribute("data-ref") ?? element?.textContent?.trim();
      if (value) return value;
    }
    const match = location.pathname.match(/\/-\/(?:tree|blob)\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : TARGET.defaultBranch;
  }

  private getCurrentCommit(doc: Document): string | undefined {
    for (const selector of GITLAB_SELECTORS.commit) {
      const element = doc.querySelector(selector);
      const candidates = [
        element?.getAttribute("data-commit-sha"),
        element?.getAttribute("content"),
        element?.getAttribute("href")?.match(/\/-\/commits?\/([0-9a-f]{7,40})/i)?.[1],
        element?.getAttribute("data-signatures-path")?.match(/\/-\/commits?\/([0-9a-f]{7,40})/i)?.[1],
        element?.textContent,
      ];
      for (const candidate of candidates) {
        const hash = candidate?.match(/\b[0-9a-f]{7,40}\b/i)?.[0];
        if (hash) return hash;
      }
    }
    return undefined;
  }

  private async walkTree(rootUrl: string, branch: string): Promise<RepositoryEntry[]> {
    const queue = [rootUrl];
    const visited = new Set<string>();
    const files = new Map<string, RepositoryEntry>();

    while (queue.length > 0) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);
      const entries = await this.loadDirectory(url, branch);
      for (const entry of entries) {
        if (entry.kind === "directory") {
          if (!visited.has(entry.url)) queue.push(entry.url);
        } else if (!files.has(entry.path)) {
          files.set(entry.path, entry);
        }
      }
    }
    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Modern GitLab exposes the same authenticated file index used by its “Find file” UI
   * in data-command-palette. Following this page-provided URL is more reliable than
   * guessing links from Vue-rendered folder rows and is not the GitLab public API.
   */
  private async listFilesFromPageIndex(branch: string): Promise<RepositoryEntry[] | null> {
    const palette = document.querySelector<HTMLElement>("[data-command-palette]");
    const rawConfig = palette?.dataset.commandPalette;
    if (!rawConfig) return null;

    let config: unknown;
    try {
      config = JSON.parse(rawConfig);
    } catch {
      return null;
    }
    if (!config || typeof config !== "object") return null;
    const values = config as Record<string, unknown>;
    if (typeof values.project_files_url !== "string" || typeof values.project_blob_url !== "string") return null;

    const filesUrl = new URL(values.project_files_url, TARGET.origin);
    const blobUrl = new URL(values.project_blob_url, TARGET.origin);
    if (
      filesUrl.origin !== TARGET.origin ||
      blobUrl.origin !== TARGET.origin ||
      !this.isTargetPath(filesUrl.pathname) ||
      !this.isTargetPath(blobUrl.pathname) ||
      !blobUrl.pathname.includes(`/-/blob/${encodeURIComponent(branch)}`)
    ) {
      return null;
    }

    const response = await fetch(filesUrl.href, {
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const paths = this.extractIndexedPaths(payload);
    if (paths.length === 0) return null;

    const base = blobUrl.pathname.replace(/\/$/, "");
    return paths.map((path) => ({
      kind: "file",
      path,
      url: `${blobUrl.origin}${base}/${path.split("/").map(encodeURIComponent).join("/")}`,
    }));
  }

  private extractIndexedPaths(payload: unknown): string[] {
    let candidate: unknown[] = [];
    if (Array.isArray(payload)) {
      candidate = payload;
    } else if (payload && typeof payload === "object") {
      const files = (payload as Record<string, unknown>).files;
      if (Array.isArray(files)) candidate = files;
    }
    return [...new Set(candidate.filter((path): path is string => typeof path === "string" && path.length > 0))];
  }

  private listDirectory(doc: Document, pageUrl: string, branch: string): RepositoryEntry[] {
    const entries = new Map<string, RepositoryEntry>();
    const encodedBranch = encodeURIComponent(branch);
    const prefixes = {
      directory: `/${TARGET.namespace}/${TARGET.repository}/-/tree/${encodedBranch}`,
      file: `/${TARGET.namespace}/${TARGET.repository}/-/blob/${encodedBranch}`,
    } as const;

    const tree = doc.querySelector("#js-tree-list");
    const anchors = tree?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? doc.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const anchor of anchors) {
      const url = new URL(anchor.href, pageUrl);
      if (url.origin !== TARGET.origin) continue;
      for (const kind of ["directory", "file"] as const) {
        const prefix = prefixes[kind];
        if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) continue;
        const rawPath = url.pathname.slice(prefix.length).replace(/^\//, "");
        if (!rawPath) continue;
        const path = decodeURIComponent(rawPath);
        const cleanUrl = `${url.origin}${url.pathname}${url.search}`;
        entries.set(`${kind}:${path}`, { kind, path, url: cleanUrl });
      }
    }
    return [...entries.values()];
  }

  private async getFileContent(blobUrl: string): Promise<string> {
    const rawUrl = deriveRawUrl(blobUrl);
    if (rawUrl) {
      const rawResponse = await fetch(rawUrl, { credentials: "include", redirect: "follow" });
      const finalUrl = new URL(rawResponse.url);
      const contentType = rawResponse.headers.get("content-type") ?? "";
      if (
        rawResponse.ok &&
        finalUrl.origin === TARGET.origin &&
        this.isTargetPath(finalUrl.pathname) &&
        !contentType.toLowerCase().includes("text/html")
      ) {
        return rawResponse.text();
      }
    }

    const doc = await this.fetchDocument(blobUrl);
    const immediate = await this.extractFileContent(doc, blobUrl);
    if (immediate !== null) return immediate;
    const rendered = await this.withRenderedPage(
      blobUrl,
      (renderedDoc) =>
        GITLAB_SELECTORS.rawLink.some((selector) => renderedDoc.querySelector(selector) !== null) ||
        GITLAB_SELECTORS.source.some((selector) => renderedDoc.querySelector(selector) !== null),
      async (renderedDoc) => this.extractFileContent(renderedDoc, blobUrl),
    );
    if (rendered !== null) return rendered;
    throw new Error(
      "Konten SQL tidak tersedia pada halaman file. Selector GitLab internal mungkin perlu disesuaikan di GitLabAdapter.",
    );
  }

  private async loadDirectory(url: string, branch: string): Promise<RepositoryEntry[]> {
    const read = (doc: Document): RepositoryEntry[] => this.listDirectory(doc, url, branch);
    if (this.isCurrentPage(url)) {
      await this.waitUntil(document, () => read(document).length > 0);
      return read(document);
    }
    const doc = await this.fetchDocument(url);
    const entries = read(doc);
    if (entries.length > 0) return entries;
    return this.withRenderedPage(url, (renderedDoc) => read(renderedDoc).length > 0, async (renderedDoc) => read(renderedDoc));
  }

  private async extractFileContent(doc: Document, blobUrl: string): Promise<string | null> {
    for (const selector of GITLAB_SELECTORS.rawLink) {
      const link = doc.querySelector<HTMLAnchorElement>(selector);
      if (!link?.href) continue;
      const rawUrl = new URL(link.href, blobUrl);
      if (rawUrl.origin !== TARGET.origin || !this.isTargetPath(rawUrl.pathname)) continue;
      const response = await fetch(rawUrl.href, { credentials: "include" });
      if (!response.ok) throw new Error(`Gagal membaca file SQL (${response.status}).`);
      return response.text();
    }
    for (const selector of GITLAB_SELECTORS.source) {
      const source = doc.querySelector<HTMLElement>(selector);
      if (source) return "value" in source ? String(source.value) : (source.textContent ?? "");
    }
    return null;
  }

  private async withRenderedPage<T>(
    url: string,
    ready: (doc: Document) => boolean,
    read: (doc: Document) => Promise<T>,
  ): Promise<T> {
    const iframe = document.createElement("iframe");
    iframe.hidden = true;
    iframe.setAttribute("aria-hidden", "true");
    document.documentElement.append(iframe);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("GitLab terlalu lama memuat halaman repository.")), 20_000);
        iframe.addEventListener("load", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
        iframe.addEventListener("error", () => {
          window.clearTimeout(timeout);
          reject(new Error("GitLab tidak dapat memuat halaman repository."));
        }, { once: true });
        iframe.src = url;
      });
      const renderedDoc = iframe.contentDocument;
      if (!renderedDoc) throw new Error("GitLab memblokir pembacaan halaman repository tersemat.");
      await this.waitUntil(renderedDoc, () => ready(renderedDoc));
      return await read(renderedDoc);
    } finally {
      iframe.remove();
    }
  }

  private async waitUntil(doc: Document, ready: () => boolean): Promise<void> {
    if (ready()) return;
    await new Promise<void>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!ready()) return;
        observer.disconnect();
        window.clearTimeout(timeout);
        resolve();
      });
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("Daftar file GitLab tidak selesai dimuat."));
      }, 20_000);
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    });
  }

  private async fetchDocument(url: string): Promise<Document> {
    if (this.isCurrentPage(url)) return document;
    const response = await fetch(url, { credentials: "include", redirect: "follow" });
    if (!response.ok) throw new Error(`GitLab mengembalikan HTTP ${response.status}.`);
    const finalUrl = new URL(response.url);
    if (finalUrl.origin !== TARGET.origin || !this.isTargetPath(finalUrl.pathname)) {
      throw new Error("GitLab mengalihkan permintaan keluar dari repository yang dituju.");
    }
    return new DOMParser().parseFromString(await response.text(), "text/html");
  }

  private isCurrentPage(url: string): boolean {
    const requested = new URL(url);
    return requested.origin === location.origin && requested.pathname === location.pathname && requested.search === location.search;
  }

  private isTargetPath(pathname: string): boolean {
    const prefix = `/${TARGET.namespace}/${TARGET.repository}`;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
}
