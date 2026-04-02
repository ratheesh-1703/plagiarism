import { NextRequest, NextResponse } from "next/server";

import { claimNextQueuedCrawlJob } from "../../_store";
import { processCrawlJob } from "../runner";

function hasWorkerAccess(request: NextRequest): boolean {
  const configured = process.env.CRAWL_WORKER_SECRET || "";
  if (!configured) {
    return false;
  }
  const supplied = request.headers.get("x-worker-secret") || "";
  return supplied === configured;
}

export async function POST(request: NextRequest) {
  if (!hasWorkerAccess(request)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { max_jobs?: number };
  const maxJobs = Number.isFinite(body.max_jobs) ? Math.max(1, Math.min(20, Number(body.max_jobs))) : 5;

  const processed: Array<{ crawl_job_id: number; status: string }> = [];

  for (let i = 0; i < maxJobs; i += 1) {
    const next = claimNextQueuedCrawlJob();
    if (!next) break;

    const result = await processCrawlJob(next.owner_id, next.crawl_job_id);
    processed.push({
      crawl_job_id: next.crawl_job_id,
      status: result?.status || "unknown",
    });
  }

  return NextResponse.json({ processed_count: processed.length, processed });
}
