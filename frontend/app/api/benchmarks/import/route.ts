import { NextRequest, NextResponse } from "next/server";

import {
  getUserIdFromAuthHeader,
  replaceBenchmarkDataset,
  type BenchmarkCase,
} from "../../_store";

type ImportPayload = {
  format?: unknown;
  domain?: unknown;
  data?: unknown;
};

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

function parseCsv(csv: string, defaultDomain: string): BenchmarkCase[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf("id");
  const sourceIdx = header.indexOf("source_text");
  const candidateIdx = header.indexOf("candidate_text");
  const expectedIdx = header.indexOf("expected_plagiarism");
  const domainIdx = header.indexOf("domain");

  if (sourceIdx < 0 || candidateIdx < 0 || expectedIdx < 0) {
    return [];
  }

  const cases: BenchmarkCase[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 4) continue;

    cases.push({
      id: idIdx >= 0 ? cols[idIdx] || `${defaultDomain}-${i}` : `${defaultDomain}-${i}`,
      source_text: cols[sourceIdx] || "",
      candidate_text: cols[candidateIdx] || "",
      expected_plagiarism: parseBoolean(cols[expectedIdx] || "false"),
      domain: domainIdx >= 0 ? (cols[domainIdx] || defaultDomain) : defaultDomain,
    });
  }
  return cases;
}

function parseJson(data: unknown, defaultDomain: string): BenchmarkCase[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item && typeof item === "object")
    .map((item, idx) => {
      const obj = item as Record<string, unknown>;
      return {
        id: typeof obj.id === "string" ? obj.id : `${defaultDomain}-${idx + 1}`,
        source_text: typeof obj.source_text === "string" ? obj.source_text : "",
        candidate_text: typeof obj.candidate_text === "string" ? obj.candidate_text : "",
        expected_plagiarism: typeof obj.expected_plagiarism === "boolean"
          ? obj.expected_plagiarism
          : parseBoolean(String(obj.expected_plagiarism || "false")),
        domain: typeof obj.domain === "string" && obj.domain.trim() ? obj.domain.trim().toLowerCase() : defaultDomain,
      } as BenchmarkCase;
    })
    .filter((c) => c.source_text.trim().length > 0 && c.candidate_text.trim().length > 0);
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as ImportPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ detail: "Invalid body" }, { status: 400 });
  }

  const format = typeof body.format === "string" ? body.format.trim().toLowerCase() : "json";
  const domain = typeof body.domain === "string" && body.domain.trim() ? body.domain.trim().toLowerCase() : "general";

  let cases: BenchmarkCase[] = [];
  if (format === "json") {
    cases = parseJson(body.data, domain);
  } else if (format === "csv") {
    if (typeof body.data !== "string") {
      return NextResponse.json({ detail: "CSV data must be a string" }, { status: 422 });
    }
    cases = parseCsv(body.data, domain);
  } else {
    return NextResponse.json({ detail: "Unsupported format. Use json or csv" }, { status: 422 });
  }

  if (!cases.length) {
    return NextResponse.json({ detail: "No valid benchmark cases found in payload" }, { status: 422 });
  }

  const imported = replaceBenchmarkDataset(userId, domain, cases);
  return NextResponse.json({ imported, domain });
}
