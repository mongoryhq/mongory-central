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
      return num;
    }
  }
  return trimmed;
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

  const headerCounts = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const name = h || `col_${idx + 1}`;
    headerCounts.set(name, (headerCounts.get(name) ?? 0) + 1);
    return name;
  });

  const records: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && !cells[0].quoted && cells[0].value.trim() === "") {
      continue;
    }
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const cell = cells[c];
      if ((headerCounts.get(key) ?? 1) > 1) {
        if (!Array.isArray(obj[key])) {
          obj[key] = [];
        }
        // Omit blank unquoted cells in repeated columns so variable-length lists
        // (e.g. tag,tag,tag with `js,ts,`) produce ["js","ts"] instead of ["js","ts",null].
        if (cell && (cell.quoted || cell.value.trim() !== "")) {
          (obj[key] as unknown[]).push(coerceCsvCell(cell));
        }
      } else {
        obj[key] = cell ? coerceCsvCell(cell) : null;
      }
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
