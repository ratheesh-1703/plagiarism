import { NextRequest, NextResponse } from "next/server";

import { getUserAnalysisThresholdInfo, getUserIdFromAuthHeader } from "../_store";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const info = getUserAnalysisThresholdInfo(userId);
  return NextResponse.json({
    threshold_ratio: Number(info.threshold.toFixed(4)),
    threshold_percent: Number((info.threshold * 100).toFixed(2)),
    source: info.source,
    updated_at: info.updated_at,
  });
}
