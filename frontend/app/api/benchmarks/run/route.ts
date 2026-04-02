import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import {
  getBenchmarkDataset,
  getUserIdFromAuthHeader,
  listBenchmarkRuns,
  overallSimilarityPercent,
  recordBenchmarkRun,
  type BenchmarkCase,
} from "../../_store";

const BENCHMARK_CASES_PATH = join(process.cwd(), "benchmark", "cases.json");

function loadCases(): BenchmarkCase[] {
  if (!existsSync(BENCHMARK_CASES_PATH)) {
    return [];
  }
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

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const imported = getBenchmarkDataset(userId, "all");
  const importedDomains = [...new Set(imported.map((c) => c.domain || "general"))].sort();

  return NextResponse.json({
    available_cases: loadCases().length,
    imported_cases: imported.length,
    imported_domains: importedDomains,
    runs: listBenchmarkRuns(userId),
  });
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { threshold?: number; domain?: string };
  const threshold = Number.isFinite(body.threshold) ? Math.max(0, Math.min(100, Number(body.threshold))) : 60;
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "all";

  const importedCases = getBenchmarkDataset(userId, domain);
  const cases = importedCases.length ? importedCases : loadCases();

  if (!cases.length) {
    return NextResponse.json({ detail: "No benchmark cases available" }, { status: 404 });
  }

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  const perCase = cases.map((testCase) => {
    const score = overallSimilarityPercent(testCase.source_text, testCase.candidate_text);
    const predicted = score >= threshold;
    const expected = testCase.expected_plagiarism;

    if (predicted && expected) tp += 1;
    if (predicted && !expected) fp += 1;
    if (!predicted && !expected) tn += 1;
    if (!predicted && expected) fn += 1;

    return {
      id: testCase.id,
      score,
      predicted_plagiarism: predicted,
      expected_plagiarism: expected,
      domain: testCase.domain || "general",
    };
  });

  const grouped = new Map<string, typeof perCase>();
  perCase.forEach((item) => {
    const key = item.domain;
    const arr = grouped.get(key) || [];
    arr.push(item);
    grouped.set(key, arr);
  });

  const perDomain = [...grouped.entries()].map(([d, items]) => {
    let dtp = 0;
    let dfp = 0;
    let dtn = 0;
    let dfn = 0;

    items.forEach((row) => {
      if (row.predicted_plagiarism && row.expected_plagiarism) dtp += 1;
      if (row.predicted_plagiarism && !row.expected_plagiarism) dfp += 1;
      if (!row.predicted_plagiarism && !row.expected_plagiarism) dtn += 1;
      if (!row.predicted_plagiarism && row.expected_plagiarism) dfn += 1;
    });

    const dPrecision = dtp + dfp > 0 ? dtp / (dtp + dfp) : 0;
    const dRecall = dtp + dfn > 0 ? dtp / (dtp + dfn) : 0;
    const dF1 = dPrecision + dRecall > 0 ? (2 * dPrecision * dRecall) / (dPrecision + dRecall) : 0;

    return {
      domain: d,
      total_cases: items.length,
      precision: Number(dPrecision.toFixed(4)),
      recall: Number(dRecall.toFixed(4)),
      f1_score: Number(dF1.toFixed(4)),
    };
  }).sort((a, b) => a.domain.localeCompare(b.domain));

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const run = recordBenchmarkRun(userId, {
    domain,
    threshold,
    total_cases: cases.length,
    true_positive: tp,
    false_positive: fp,
    true_negative: tn,
    false_negative: fn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1_score: Number(f1.toFixed(4)),
    per_domain: perDomain,
  });

  return NextResponse.json({ run, per_case: perCase });
}
