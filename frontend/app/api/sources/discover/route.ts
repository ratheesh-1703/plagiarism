import { NextRequest, NextResponse } from "next/server";

import { getUserIdFromAuthHeader } from "../../_store";
import { discoverAndIngestSources, type DiscoveryProvider } from "../discovery";

type DiscoverInput = {
  query?: unknown;
  maxResults?: unknown;
  providers?: unknown;
};

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as DiscoverInput | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const maxResults = typeof body?.maxResults === "number" ? Math.max(3, Math.min(body.maxResults, 50)) : 15;
  const providers = Array.isArray(body?.providers)
    ? body.providers.filter((p): p is DiscoveryProvider => typeof p === "string").map((p) => p.toLowerCase() as DiscoveryProvider)
    : undefined;

  if (query.length < 3) {
    return NextResponse.json({ detail: "Query must be at least 3 characters" }, { status: 422 });
  }

  const result = await discoverAndIngestSources({
    ownerId: userId,
    query,
    maxResults,
    providers,
  });

  if (!result.discovered) {
    return NextResponse.json({ detail: "No online sources found for this query" }, { status: 404 });
  }

  return NextResponse.json({
    query,
    providers_used: result.providersUsed,
    discovered: result.discovered,
    ingested: result.ingested,
    duplicates: result.duplicates,
    items: result.items.map((item) => ({
      source_id: item.source_id,
      platform: item.platform,
      title: item.title,
      url: item.url,
      created_at: item.created_at,
    })),
  });
}
