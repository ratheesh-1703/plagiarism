import { NextRequest, NextResponse } from "next/server";

import { createCrawlJob, getUserIdFromAuthHeader, listCrawlJobs } from "../_store";
import type { DiscoveryProvider } from "../sources/discovery";

type CreateCrawlJobInput = {
  query?: unknown;
  max_results?: unknown;
  providers?: unknown;
  auto_run?: unknown;
};

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const items = listCrawlJobs(userId);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as CreateCrawlJobInput | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const maxResults = typeof body?.max_results === "number" ? Math.max(10, Math.min(body.max_results, 200)) : 60;
  const providers = Array.isArray(body?.providers)
    ? body.providers.filter((p): p is DiscoveryProvider => typeof p === "string").map((p) => p.toLowerCase() as DiscoveryProvider)
    : ["openalex", "crossref", "wikipedia", "ieee", "elsevier"];
  const autoRun = body?.auto_run !== false;

  if (query.length < 3) {
    return NextResponse.json({ detail: "Query must be at least 3 characters" }, { status: 422 });
  }

  const job = createCrawlJob(userId, query, maxResults, providers);

  return NextResponse.json({
    item: job,
    dispatch_required: true,
    note: autoRun
      ? "Job queued. Trigger /api/crawl-jobs/worker from a scheduler to execute queued jobs."
      : "Job queued without auto-run.",
  }, { status: 202 });
}
