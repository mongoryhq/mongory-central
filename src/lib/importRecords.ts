export type ImportRecordsResult =
  | {
      ok: true;
      format: "json" | "csv";
      records: unknown[];
      formatted: string;
      count: number;
    }
  | {
      ok: false;
      error: string;
    };

interface CsvCell {
  value: string;
  quoted: boolean;
}

const JSON_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function coerceCsvCell(cell: CsvCell): unknown {
  if (cell.quoted) {
    return cell.value;
  }
  const trimmed = cell.value.trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  if (JSON_NUMBER_RE.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return trimmed;
}

/**
 * Parses RFC 4180 CSV text into rows of cells, preserving whether each cell
 * was quoted so callers can distinguish `"42"` from `42` and `""` from empty.
 */
function parseCsvRows(input: string): { ok: true; rows: CsvCell[][] } | { ok: false; error: string } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let field = "";
  let inQuotes = false;
  let quoted = false;
  let fieldStarted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (!fieldStarted && ch === '"') {
      inQuotes = true;
      quoted = true;
      fieldStarted = true;
      continue;
    }

    if (ch === ",") {
      row.push({ value: field, quoted });
      field = "";
      quoted = false;
      fieldStarted = false;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push({ value: field, quoted });
      rows.push(row);
      row = [];
      field = "";
      quoted = false;
      fieldStarted = false;
      continue;
    }

    field += ch;
    fieldStarted = true;
  }

  if (inQuotes) {
    return { ok: false, error: "Unterminated quoted field in CSV." };
  }

  if (fieldStarted || row.length > 0) {
    row.push({ value: field, quoted });
    rows.push(row);
  }

  // Drop trailing blank lines (e.g. final newline in file).
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && !last[0].quoted && last[0].value.trim() === "") {
      rows.pop();
    } else {
      break;
    }
  }

  return { ok: true, rows };
}

/**
 * Converts CSV text with a header row into an array of JSON-compatible record objects.
 */
export function parseCsvToRecords(input: string): { ok: true; records: Record<string, unknown>[] } | { ok: false; error: string } {
  const parsed = parseCsvRows(input);
  if (!parsed.ok) {
    return parsed;
  }
  const { rows } = parsed;
  if (rows.length === 0) {
    return { ok: false, error: "CSV file is empty." };
  }

  const rawHeaders = rows[0].map((c) => c.value.trim());
  if (rawHeaders.every((h) => h === "")) {
    return { ok: false, error: "CSV header row is empty." };
  }

  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const base = h || `col_${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });

  const records: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && !cells[0].quoted && cells[0].value.trim() === "") {
      continue;
    }
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const cell = cells[c];
      obj[headers[c]] = cell ? coerceCsvCell(cell) : null;
    }
    records.push(obj);
  }

  return { ok: true, records };
}

function detectFormat(text: string, filename?: string): "json" | "csv" | null {
  const lower = filename?.trim().toLowerCase() ?? "";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";

  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "json";
  }
  if (lower === "") {
    return "csv";
  }
  return null;
}

/**
 * Imports records from a JSON or CSV file's text contents and returns pretty-printed JSON.
 */
export function importRecordsFromText(text: string, filename?: string): ImportRecordsResult {
  const format = detectFormat(text, filename);
  if (!format) {
    return {
      ok: false,
      error: `Unsupported file "${filename}". Please import a .json or .csv file.`,
    };
  }

  if (format === "json") {
    try {
      const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      const parsed: unknown = JSON.parse(cleaned);
      let records: unknown[];
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (parsed !== null && typeof parsed === "object") {
        records = [parsed];
      } else {
        return {
          ok: false,
          error: "JSON file must contain an array [ ... ] or an object { ... }.",
        };
      }
      return {
        ok: true,
        format: "json",
        records,
        formatted: JSON.stringify(records, null, 2),
        count: records.length,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const csv = parseCsvToRecords(text);
  if (!csv.ok) {
    return { ok: false, error: csv.error };
  }
  return {
    ok: true,
    format: "csv",
    records: csv.records,
    formatted: JSON.stringify(csv.records, null, 2),
    count: csv.records.length,
  };
}
