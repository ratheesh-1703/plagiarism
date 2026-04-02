import { NextRequest, NextResponse } from "next/server";

import { enforceReportRetention, getStore, getUserIdFromAuthHeader } from "../_store";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  enforceReportRetention(userId);

  const store = getStore();
  const items = store.reports
    .filter((r) => r.owner_id === userId)
    .map((r) => ({
      report_id: r.report_id,
      created_at: r.created_at,
      overall_similarity: r.summary.overall_similarity,
      plagiarism_score: r.summary.plagiarism_score,
    }))
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

  return NextResponse.json({ items });
}
