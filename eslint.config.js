import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "vite.config.ts"],
    languageOptions: {
      globals: {
        chrome: "readonly",
        document: "readonly",
        window: "readonly",
        DOMParser: "readonly",
        URL: "readonly",
        fetch: "readonly",
        RequestCredentials: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLDialogElement: "readonly",
        HTMLAnchorElement: "readonly",
        Node: "readonly",
        Event: "readonly",
        MutationObserver: "readonly",
        requestAnimationFrame: "readonly",
      },
    },
  },
);
