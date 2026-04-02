import { NextRequest, NextResponse } from "next/server";

import {
  ingestIndexedSource,
  listIndexedSources,
  getStore,
  getUserIdFromAuthHeader,
} from "../_store";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const platform = request.nextUrl.searchParams.get("platform") || undefined;
  const items = listIndexedSources(userId, platform).map((source) => ({
    source_id: source.source_id,
    report_id: 0,
    created_at: source.created_at,
    platform: source.platform,
    title: source.title,
    url: source.url,
    matched_percentage: 0,
    snippet: source.text.slice(0, 220),
  }));

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  // Allow quick ingestion from previously uploaded document text.
  if (typeof (body as { document_id?: unknown }).document_id === "number") {
    const store = getStore();
    const doc = store.documents.find(
      (item) => item.document_id === (body as { document_id: number }).document_id && item.owner_id === userId,
    );

    if (!doc || !doc.text.trim()) {
      return NextResponse.json({ detail: "Document not found or empty" }, { status: 404 });
    }

    const created = ingestIndexedSource(userId, {
      platform: "Uploaded Document",
      title: doc.filename,
      text: doc.text,
    });

    return NextResponse.json({ item: created }, { status: 201 });
  }

  const payload = body as { platform?: unknown; title?: unknown; url?: unknown; text?: unknown };
  if (typeof payload.text !== "string" || payload.text.trim().length < 40) {
    return NextResponse.json({ detail: "Source text must be at least 40 characters" }, { status: 422 });
  }

  const created = ingestIndexedSource(userId, {
    platform: typeof payload.platform === "string" ? payload.platform : "External Source",
    title: typeof payload.title === "string" ? payload.title : "Untitled Source",
    url: typeof payload.url === "string" ? payload.url : "",
    text: payload.text,
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
