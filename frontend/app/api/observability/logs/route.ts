import { NextRequest, NextResponse } from "next/server";

import { getUserIdFromAuthHeader, listObservabilityLogs } from "../../_store";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const provider = request.nextUrl.searchParams.get("provider") || undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "200");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 200;

  const items = listObservabilityLogs(userId, provider).slice(0, limit);
  return NextResponse.json({ items });
}
