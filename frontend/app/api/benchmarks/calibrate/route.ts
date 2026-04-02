import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import {
  getBenchmarkDataset,
  getUserIdFromAuthHeader,
  overallSimilarityPercent,
  setUserAnalysisThreshold,
  type BenchmarkCase,
} from "../../_store";

const BENCHMARK_CASES_PATH = join(process.cwd(), "benchmark", "cases.json");

function loadSeedCases(): BenchmarkCase[] {
  if (!existsSync(BENCHMARK_CASES_PATH)) return [];
  const raw = readFileSync(BENCHMARK_CASES_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((item): item is BenchmarkCase => {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    return typeof c.id === "string"
      && typeof c.source_text === "string"
      && typeof c.candidate_text === "string"
      && typeof c.expected_plagiarism === "boolean";
  });
}

type Metrics = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
};

function evaluate(cases: BenchmarkCase[], thresholdPct: number): Metrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  cases.forEach((testCase) => {
    const score = overallSimilarityPercent(testCase.source_text, testCase.candidate_text);
    const predicted = score >= thresholdPct;
    const expected = testCase.expected_plagiarism;

    if (predicted && expected) tp += 1;
    if (predicted && !expected) fp += 1;
    if (!predicted && !expected) tn += 1;
    if (!predicted && expected) fn += 1;
  });

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { threshold: thresholdPct, precision, recall, f1, tp, fp, tn, fn };
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    target_precision?: number;
    domain?: string;
  };

  const targetPrecision = Number.isFinite(body.target_precision)
    ? Math.max(0.6, Math.min(0.99, Number(body.target_precision)))
    : 0.93;
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "all";

  const imported = getBenchmarkDataset(userId, domain);
  const cases = imported.length ? imported : loadSeedCases();
  if (!cases.length) {
    return NextResponse.json({ detail: "No benchmark cases available for calibration" }, { status: 404 });
  }

  const evaluated: Metrics[] = [];
  for (let threshold = 40; threshold <= 95; threshold += 1) {
    evaluated.push(evaluate(cases, threshold));
  }

  const ranked = evaluated.sort((a, b) => {
    const aDelta = Math.abs(a.precision - targetPrecision);
    const bDelta = Math.abs(b.precision - targetPrecision);
    if (aDelta !== bDelta) return aDelta - bDelta;
    if (b.recall !== a.recall) return b.recall - a.recall;
    return b.f1 - a.f1;
  });

  const chosen = ranked[0];
  const normalizedThreshold = setUserAnalysisThreshold(userId, chosen.threshold / 100);

  return NextResponse.json({
    domain,
    target_precision: targetPrecision,
    selected_threshold_percent: chosen.threshold,
    selected_threshold_ratio: Number(normalizedThreshold.toFixed(4)),
    metrics: {
      precision: Number(chosen.precision.toFixed(4)),
      recall: Number(chosen.recall.toFixed(4)),
      f1: Number(chosen.f1.toFixed(4)),
      tp: chosen.tp,
      fp: chosen.fp,
      tn: chosen.tn,
      fn: chosen.fn,
    },
    note: "Threshold tuned to benchmark data; this improves reliability but does not guarantee universal 93% real-world accuracy.",
  });
}
