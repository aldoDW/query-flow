import type { WilayahConfig } from "../../types";

const PARAMETER_VALUE = (alias: string): RegExp =>
  new RegExp(`'(?:''|[^'])*'\\s+AS\\s+${alias}\\b`, "i");

export function extractSqlTitle(sql: string, fallback: string): string {
  const comment = sql.match(/\/\*([\s\S]*?)\*\//)?.[1];
  const title = comment?.match(/^[\t ]*(?:\*[\t ]*)?(?:Nama[\t ]+Tabel|Judul[\t ]+Tabel|Judul)[\t ]*:[\t ]*(\S[^\r\n]*)/im)?.[1]?.trim();
  return title || fallback.replace(/\.sql$/i, "");
}

export function applyWilayahConfig(sql: string, config: WilayahConfig): string {
  // The repository predicates combine province and regency filters with OR.
  // Therefore a populated province would broaden an explicit regency selection
  // to the entire province. Regency/city selections intentionally take priority.
  const provinceValue = config.level2.length > 0 ? "" : config.level1.join("|");
  const regencyValue = config.level2.join("|");
  const provincePattern = PARAMETER_VALUE("filter_provinsi");
  const regencyPattern = PARAMETER_VALUE("filter_kabupaten");

  if (!provincePattern.test(sql) || !regencyPattern.test(sql)) return sql;

  let prepared = sql
    .replace(provincePattern, `'${provinceValue}' AS filter_provinsi`)
    .replace(regencyPattern, `'${regencyValue}' AS filter_kabupaten`);

  // Existing repository queries compare one province with equality. Convert that
  // comparison to the same pipe-delimited membership check used by kabupaten/kota.
  const provinceEquality = /((?:LEFT\s*\([^)]*\)|CAST\s*\([^)]*\)|(?:[A-Za-z_]\w*\.)?level_1_full_code))\s*=\s*([A-Za-z_]\w*\.filter_provinsi)\b/gi;
  prepared = prepared.replace(
    provinceEquality,
    (_match, regionExpression: string, parameterExpression: string) =>
      `CONCAT('|', ${parameterExpression}, '|') LIKE CONCAT('%|', ${regionExpression}, '|%')`,
  );
  return prepared;
}
