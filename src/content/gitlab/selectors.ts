/**
 * The only DOM selectors that depend on GitLab's rendered markup.
 * Keep instance-specific adjustments in this file and adapter.ts.
 */
export const GITLAB_SELECTORS = {
  branch: [
    '#js-tree-list[data-ref]',
    '#js-repository-blob-header-app[data-ref]',
    '[data-testid="ref-selector"]',
    '[data-testid="branch-name"]',
    '.ref-selector .dropdown-toggle-text',
  ],
  commit: [
    '[data-testid="commit-sha"]',
    '[data-testid="commit-short-sha"]',
    'a[href*="/-/commit/"]',
    '[data-signatures-path*="/-/commits/"]',
    'meta[property="og:description"]',
  ],
  rawLink: [
    'a[data-testid="raw-button"]',
    'a[aria-label="Open raw"]',
    'a[href*="/-/raw/"]',
  ],
  source: [
    '[data-testid="blob-content"] pre',
    '.blob-content pre',
    '.file-content pre',
    'textarea[data-testid="blob-content"]',
  ],
} as const;
