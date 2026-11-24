import type { ExplainNode, TraceTreeResult } from "mongory-js";

export type PresetId =
  | "ecommerce"
  | "feature-flags"
  | "rbac"
  | "arrays"
  | "dot-priority";

export interface Preset {
  id: PresetId;
  label: string;
  badge: string;
  description: string;
  condition: Record<string, unknown>;
  records: unknown[];
  defaultSelectedIndex: number;
}

export type LangKey = "js" | "go" | "py" | "rb" | "core";

export interface LanguageDoc {
  key: LangKey;
  name: string;
  pkg: string;
  version: string;
  repoUrl: string;
  installCmd: string;
  runtime: string;
  highlights: string[];
  code: string;
}

export type OperatorCategory =
  | "All"
  | "Compare"
  | "Inclusion"
  | "Existence"
  | "Composite"
  | "Array"
  | "Regex";

export interface OperatorSpec {
  name: string;
  category: Exclude<OperatorCategory, "All">;
  priority: string;
  summary: string;
  example: string;
}

export interface BenchmarkRow {
  caseName: string;
  description: string;
  jsNodeNs: string;
  jsBunNs: string;
  goMapsNs: string;
  goAlloc: string;
}

export interface CompetitorBenchmarkRow {
  language: string;
  mongoryPkg: string;
  peerLib: string;
  standardSpeedup: string;
  largeInSpeedup: string;
  notes: string;
  benchUrl: string;
}

export interface SharePayload {
  preset?: PresetId;
  recordsText: string;
  conditionText: string;
  selectedIndex: number;
}

export interface EvaluationState {
  records: unknown[] | null;
  recordsError: string | null;
  condition: Record<string, unknown> | null;
  conditionError: string | null;
  compileError: string | null;
  compileUs: number | null;
  evalUs: number | null;
  explainText: string;
  explainTree: ExplainNode | null;
  results: boolean[];
  matchedCount: number;
  selectedTraceText: string;
  selectedTraceTree: TraceTreeResult | null;
}
