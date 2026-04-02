import { NextRequest, NextResponse } from "next/server";

import { enforceReportRetention, getStore, getUserIdFromAuthHeader } from "../../_store";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  enforceReportRetention(userId);

  const reportId = Number(context.params.id);
  const store = getStore();
  const report = store.reports.find((r) => r.report_id === reportId && r.owner_id === userId);
  if (!report) {
    return NextResponse.json({ detail: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
