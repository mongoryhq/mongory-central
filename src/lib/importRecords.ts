export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB raw input
export const MAX_IMPORT_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MB formatted JSON output
export const MAX_IMPORT_RECORDS = 5000;

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function validateImportFileSize(bytes: number, maxBytes = MAX_IMPORT_FILE_BYTES): string | null {
  if (bytes > maxBytes) {
    return `File is too large (${formatFileSize(bytes)}). Maximum allowed size is ${formatFileSize(maxBytes)}.`;
  }
  return null;
}

/**
 * Decodes an uploaded file ArrayBuffer, detecting UTF-8, UTF-16LE, and UTF-16BE
 * BOMs (common in Excel exports) and flagging invalid UTF-8 replacement chars.
 */
export function decodeImportBuffer(buffer: ArrayBuffer): { text: string; warning?: string } {
  const bytes = new Uint8Array(buffer);
  let encoding = "utf-8";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
  }
  const text = new TextDecoder(encoding).decode(bytes);
  if (encoding === "utf-8" && text.includes("\uFFFD")) {
    return {
      text,
      warning: "Non-UTF-8 characters detected; re-save as UTF-8 CSV if text looks garbled.",
    };
  }
  return { text };
}

export type ImportRecordsResult =
  | {
      ok: true;
      format: "json" | "csv";
      records: unknown[];
      formatted: string;
      count: number;
      warnings: string[];
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
const JSON_INTEGER_RE = /^-?(?:0|[1-9]\d*)$/;

function coerceCsvCell(cell: CsvCell): unknown {
  if (cell.quoted) {
    return cell.value;
  }
  const trimmed = cell.value.trim();
  if (trimmed === "") {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  if (lower === "null") {
    return null;
  }
  if (JSON_NUMBER_RE.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      // Preserve long integer IDs (e.g. order/card numbers > 2^53 - 1) as strings to avoid precision loss.
      if (JSON_INTEGER_RE.test(trimmed) && !Number.isSafeInteger(num)) {
        return trimmed;
      }
      return num;
    }
  }
  return trimmed;
}

function setOwnProperty(obj: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function detectDelimiter(text: string): { delimiter: string; body: string } {
  // Excel sometimes prepends a `sep=,` or `sep=;` directive on line 1.
  const firstNewline = text.search(/\r\n|\n|\r/);
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const sepMatch = /^sep=(.)$/i.exec(firstLine.trim());
  if (sepMatch && firstNewline !== -1) {
    const advance = text[firstNewline] === "\r" && text[firstNewline + 1] === "\n" ? 2 : 1;
    return { delimiter: sepMatch[1], body: text.slice(firstNewline + advance) };
  }

  // Auto-detect `;` (European Excel) or `\t` (TSV) when header has no unquoted commas.
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes) {
      if (ch === ",") commas++;
      else if (ch === ";") semicolons++;
      else if (ch === "\t") tabs++;
    }
  }
  if (commas === 0 && semicolons > 0) {
    return { delimiter: ";", body: text };
  }
  if (commas === 0 && semicolons === 0 && tabs > 0) {
    return { delimiter: "\t", body: text };
  }
  return { delimiter: ",", body: text };
}

/**
 * Parses RFC 4180 / Excel-exported CSV text into rows of cells, preserving whether
 * each cell was quoted so callers can distinguish `"42"` from `42` and `""` from empty.
 */
function parseCsvRows(input: string): { ok: true; rows: CsvCell[][] } | { ok: false; error: string } {
  const withoutBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const { delimiter, body: text } = detectDelimiter(withoutBom);
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let field = "";
  let inQuotes = false;
  let quoted = false;
  let afterClosingQuote = false;
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
          afterClosingQuote = true;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (!fieldStarted && (ch === " " || (ch === "\t" && delimiter !== "\t"))) {
      // Allow optional whitespace before an opening quote (e.g. `, "value"`).
      let lookahead = i + 1;
      while (lookahead < text.length && (text[lookahead] === " " || (text[lookahead] === "\t" && delimiter !== "\t"))) {
        lookahead++;
      }
      if (text[lookahead] === '"') {
        i = lookahead - 1;
        continue;
      }
    }

    if (!fieldStarted && ch === '"') {
      inQuotes = true;
      quoted = true;
      fieldStarted = true;
      continue;
    }

    if (afterClosingQuote && (ch === " " || (ch === "\t" && delimiter !== "\t"))) {
      continue;
    }

    if (ch === delimiter) {
      row.push({ value: field, quoted });
      field = "";
      quoted = false;
      afterClosingQuote = false;
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
      afterClosingQuote = false;
      fieldStarted = false;
      continue;
    }

    afterClosingQuote = false;
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
 * Converts CSV/TSV text with a header row into an array of JSON-compatible record objects.
 */
export function parseCsvToRecords(
  input: string,
): { ok: true; records: Record<string, unknown>[]; extraColumnRows: number } | { ok: false; error: string } {
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

  const headerCounts = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const name = h || `col_${idx + 1}`;
    headerCounts.set(name, (headerCounts.get(name) ?? 0) + 1);
    return name;
  });

  const records: Record<string, unknown>[] = [];
  let extraColumnRows = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && !cells[0].quoted && cells[0].value.trim() === "") {
      continue;
    }
    if (records.length >= MAX_IMPORT_RECORDS) {
      return {
        ok: false,
        error: `Too many CSV rows (exceeds maximum of ${MAX_IMPORT_RECORDS.toLocaleString()} records).`,
      };
    }
    if (cells.length > headers.length) {
      extraColumnRows++;
    }
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const cell = cells[c];
      if ((headerCounts.get(key) ?? 1) > 1) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
          setOwnProperty(obj, key, []);
        }
        // Omit blank unquoted cells in repeated columns so variable-length lists
        // (e.g. tag,tag,tag with `js,ts,`) produce ["js","ts"] instead of ["js","ts",null].
        if (cell && (cell.quoted || cell.value.trim() !== "")) {
          (obj[key] as unknown[]).push(coerceCsvCell(cell));
        }
      } else {
        setOwnProperty(obj, key, cell ? coerceCsvCell(cell) : null);
      }
    }
    records.push(obj);
  }

  return { ok: true, records, extraColumnRows };
}

function detectFormat(text: string, filename?: string): "json" | "csv" | null {
  const lower = filename?.trim().toLowerCase() ?? "";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";

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
 * Imports records from a JSON, CSV, or TSV file's text contents and returns
 * pretty-printed JSON bounded by record count and formatted byte size limits.
 */
export function importRecordsFromText(
  text: string,
  filename?: string,
  rawByteLength?: number,
): ImportRecordsResult {
  const inputBytes = rawByteLength ?? new TextEncoder().encode(text).byteLength;
  const sizeError = validateImportFileSize(inputBytes);
  if (sizeError) {
    return { ok: false, error: sizeError };
  }

  const format = detectFormat(text, filename);
  if (!format) {
    return {
      ok: false,
      error: `Unsupported file "${filename}". Please import a .json, .csv, or .tsv file.`,
    };
  }

  let records: unknown[];
  const warnings: string[] = [];

  if (format === "json") {
    try {
      const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      const parsed: unknown = JSON.parse(cleaned);
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
      if (records.length > MAX_IMPORT_RECORDS) {
        return {
          ok: false,
          error: `Too many JSON records (${records.length.toLocaleString()}). Maximum allowed is ${MAX_IMPORT_RECORDS.toLocaleString()}.`,
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    const csv = parseCsvToRecords(text);
    if (!csv.ok) {
      return { ok: false, error: csv.error };
    }
    records = csv.records;
    if (csv.extraColumnRows > 0) {
      warnings.push(
        `${csv.extraColumnRows} row(s) had extra columns beyond the header and were truncated.`,
      );
    }
  }

  const formatted = JSON.stringify(records, null, 2);
  if (formatted.length > MAX_IMPORT_OUTPUT_BYTES) {
    return {
      ok: false,
      error: `Formatted JSON is too large (${formatFileSize(formatted.length)}). Maximum output size is ${formatFileSize(MAX_IMPORT_OUTPUT_BYTES)}.`,
    };
  }

  return {
    ok: true,
    format,
    records,
    formatted,
    count: records.length,
    warnings,
  };
}
