import type { PresetId, SharePayload } from "../types.js";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeShareState(payload: SharePayload): string {
  const compact = JSON.stringify({
    p: payload.preset,
    r: payload.recordsText,
    q: payload.conditionText,
    s: payload.selectedIndex,
  });
  const encoded = bytesToBase64Url(new TextEncoder().encode(compact));
  return `#state=${encoded}`;
}

const VALID_PRESETS = new Set<PresetId>([
  "ecommerce",
  "feature-flags",
  "rbac",
  "arrays",
  "dot-priority",
]);

export function decodeShareState(hashOrQuery: string): Partial<SharePayload> | null {
  const trimmed = hashOrQuery.trim().replace(/^#/, "");
  if (!trimmed) {
    return null;
  }
  const params = new URLSearchParams(trimmed);
  const raw = params.get("state");
  if (!raw) {
    const presetParam = params.get("preset") as PresetId | null;
    if (presetParam && VALID_PRESETS.has(presetParam)) {
      return { preset: presetParam };
    }
    return null;
  }
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(raw));
    const parsed = JSON.parse(json) as {
      p?: unknown;
      r?: unknown;
      q?: unknown;
      s?: unknown;
    };
    const out: Partial<SharePayload> = {};
    if (typeof parsed.p === "string" && VALID_PRESETS.has(parsed.p as PresetId)) {
      out.preset = parsed.p as PresetId;
    }
    if (typeof parsed.r === "string") {
      out.recordsText = parsed.r;
    }
    if (typeof parsed.q === "string") {
      out.conditionText = parsed.q;
    }
    if (typeof parsed.s === "number" && Number.isInteger(parsed.s) && parsed.s >= 0) {
      out.selectedIndex = parsed.s;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function formatRecordPreview(record: unknown): string {
  if (record === null) return "null";
  if (typeof record !== "object") return JSON.stringify(record) ?? String(record);
  if (Array.isArray(record)) {
    const head = record.slice(0, 4).map((item) => JSON.stringify(item)).join(", ");
    return `[${head}${record.length > 4 ? `, ...+${record.length - 4}` : ""}]`;
  }
  const obj = record as Record<string, unknown>;
  const keys = Object.keys(obj);
  const pairs = keys.slice(0, 4).map((k) => {
    const val = obj[k];
    const repr =
      val !== null && typeof val === "object"
        ? Array.isArray(val)
          ? `[${val.length}]`
          : "{...}"
        : JSON.stringify(val);
    return `${k}: ${repr}`;
  });
  return `{ ${pairs.join(", ")}${keys.length > 4 ? `, +${keys.length - 4}` : ""} }`;
}

export function tryFormatJson(raw: string): { ok: true; formatted: string } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    return { ok: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
