import { NextRequest, NextResponse } from "next/server";

import { getStore, getUserIdFromAuthHeader } from "../../../_store";
import { processCrawlJob } from "../../runner";

export async function POST(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const crawlJobId = Number(context.params.id);
  const store = getStore();
  const exists = store.crawlJobs.find((item) => item.crawl_job_id === crawlJobId && item.owner_id === userId);
  if (!exists) {
    return NextResponse.json({ detail: "Crawl job not found" }, { status: 404 });
  }

  const updated = await processCrawlJob(userId, crawlJobId);
  return NextResponse.json({ item: updated });
}
