import { NextRequest, NextResponse } from "next/server";

import { enforceReportRetention, getStore, getUserIdFromAuthHeader } from "../../_store";

function retentionDays(): number {
  const parsed = Number(process.env.REPORT_RETENTION_DAYS || "180");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 180;
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const currentReports = getStore().reports.filter((report) => report.owner_id === userId).length;
  return NextResponse.json({ retention_days: retentionDays(), current_reports: currentReports });
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const removed = enforceReportRetention(userId);
  const remaining = getStore().reports.filter((report) => report.owner_id === userId).length;

  return NextResponse.json({ retention_days: retentionDays(), removed, remaining });
}
