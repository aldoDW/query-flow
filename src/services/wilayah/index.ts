import type { WilayahConfig } from "../../types";

export const DEFAULT_WILAYAH: WilayahConfig = {
  level1: [],
  level2: [],
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWilayah(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { valid: false, errors: ["Konfigurasi wilayah tidak valid."] };
  const candidate = value as Partial<WilayahConfig>;
  validateCodes(candidate.level1, "Level 1", errors);
  validateCodes(candidate.level2, "Level 2", errors);
  return { valid: errors.length === 0, errors };
}

function validateCodes(value: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} harus berupa daftar.`);
    return;
  }
  if (value.some((code) => typeof code !== "string" || !/^\d+$/.test(code))) {
    errors.push(`Semua kode ${label} harus berisi angka.`);
  }
  if (new Set(value).size !== value.length) errors.push(`Kode ${label} tidak boleh duplikat.`);
}

export function normalizeWilayah(value: unknown): WilayahConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { level1?: unknown; level2?: unknown };
  const migrated = {
    level1: typeof candidate.level1 === "string"
      ? (candidate.level1.trim() ? [candidate.level1.trim()] : [])
      : candidate.level1,
    level2: candidate.level2,
  };
  return validateWilayah(migrated).valid ? migrated as WilayahConfig : null;
}

export function addWilayahCode(config: WilayahConfig, level: keyof WilayahConfig, code: string): WilayahConfig {
  const normalized = code.trim();
  if (!/^\d+$/.test(normalized) || config[level].includes(normalized)) return config;
  return { ...config, [level]: [...config[level], normalized] };
}
