import { NextRequest, NextResponse } from "next/server";

import {
  buildReportAuditMetadata,
  CandidateSource,
  computeReport,
  enforceReportRetention,
  getUserAnalysisThreshold,
  getPublishedMockSources,
  getIndexedSourceCandidates,
  getStore,
  getUserIdFromAuthHeader,
  ingestIndexedSource,
  persistStore,
  rankIndexedSourceEvidence,
  rankCandidateMatches,
} from "../_store";

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  enforceReportRetention(userId);

  const body = await request.json();
  const store = getStore();

  let sourceText: string | undefined = body?.source_text;
  let comparisonText: string | undefined = typeof body?.comparison_text === "string"
    ? body.comparison_text.trim()
    : undefined;

  if (body?.source_document_id) {
    const doc = store.documents.find(
      (d) => d.document_id === body.source_document_id && d.owner_id === userId,
    );
    sourceText = doc?.text;
  }

  // Prefer explicit source_text if provided so users can correct noisy extraction from uploaded binary files.
  if (typeof body?.source_text === "string" && body.source_text.trim().length > 0) {
    sourceText = body.source_text.trim();
  }

  if (!sourceText) {
    return NextResponse.json({ detail: "Source text is required" }, { status: 422 });
  }

  // Hard cap: ~8 papers of text easily exceeds 60 k chars; cap at 60,000 to prevent
  // the request thread stalling. Sentences are sampled internally for scoring.
  const MAX_CHARS = 60_000;
  let textTruncated = false;
  if (sourceText.length > MAX_CHARS) {
    sourceText = sourceText.slice(0, MAX_CHARS);
    textTruncated = true;
  }

  const compareAgainst = Array.isArray(body?.compare_against)
    ? body.compare_against.filter((v: unknown): v is string => typeof v === "string" && v.trim().length >= 20)
    : [];

  compareAgainst.forEach((text: string, index: number) => {
    ingestIndexedSource(userId, {
      platform: "User Reference Corpus",
      title: `Corpus Entry ${index + 1}`,
      text,
    });
  });

  let publishedMatches: Array<{
    source_id?: number;
    platform: string;
    title: string;
    url: string;
    matched_percentage: number;
    matched_sentences?: Array<{ source_sentence: string; matched_chunk: string; score: number; source_sentence_index: number; chunk_id: number }>;
  }> = [];
  let publishedMaxSimilarity = 0;

  const indexedEvidence = rankIndexedSourceEvidence(sourceText, userId, 8);
  if (indexedEvidence.length) {
    publishedMatches = indexedEvidence.map((item) => ({
      source_id: item.source_id,
      platform: item.platform,
      title: item.title,
      url: item.url,
      matched_percentage: item.matched_percentage,
      matched_sentences: item.matched_sentences,
    }));
    publishedMaxSimilarity = indexedEvidence[0].matched_percentage;
  } else {
    const publishedRanking = rankCandidateMatches(sourceText, getPublishedMockSources());
    publishedMatches = publishedRanking.matches;
    publishedMaxSimilarity = publishedRanking.maxSimilarity;
  }

  if (!comparisonText) {
    const candidates: CandidateSource[] = [];

    const priorSubmissions = store.documents
      .filter((d) => d.owner_id === userId && d.text.trim().length >= 20)
      .filter((d) => !body?.source_document_id || d.document_id !== body.source_document_id)
      .map((d) => ({
        platform: "Previous Student Submission",
        title: d.filename,
        url: "",
        text: d.text,
      }));

    const indexedCandidates = getIndexedSourceCandidates(userId);
    candidates.push(...priorSubmissions, ...indexedCandidates, ...getPublishedMockSources());

    const autoRanking = rankCandidateMatches(sourceText, candidates);
    comparisonText = autoRanking.bestText;

    if (!comparisonText) {
      return NextResponse.json(
        { detail: "No comparison sources available. Add comparison text or provide reference corpus entries." },
        { status: 422 },
      );
    }
  }

  if (!comparisonText) {
    return NextResponse.json({ detail: "Comparison text could not be determined" }, { status: 422 });
  }

  const report = computeReport(
    sourceText,
    comparisonText,
    store.nextReportId++,
    userId,
    compareAgainst,
    {
      publishedMaxSimilarity,
      publishedStatus: indexedEvidence.length ? "indexed" : "fallback_mock",
      publishedMessage: indexedEvidence.length
        ? "Comparison used your indexed source corpus with sentence-level evidence."
        : "Comparison used fallback mock sources. Ingest sources for stronger verification.",
      sourceEvidenceMatches: indexedEvidence,
      threshold: getUserAnalysisThreshold(userId),
      audit: buildReportAuditMetadata({
        ownerId: userId,
        sourceText,
        comparisonText,
        indexedSourcesConsidered: getIndexedSourceCandidates(userId).length,
        providersUsed: indexedEvidence.length ? ["indexed-sources"] : ["fallback-mock"],
      }),
      expiresAt: new Date(Date.now() + (Number(process.env.REPORT_RETENTION_DAYS || "180") * 24 * 60 * 60 * 1000)).toISOString(),
    },
  );
  report.published_source_matches = publishedMatches;
  if (textTruncated) {
    (report as Record<string, unknown>).notice = `Input was truncated to ${MAX_CHARS.toLocaleString()} characters. For full coverage, split the text into individual papers.`;
  }
  store.reports.push(report);
  persistStore();

  return NextResponse.json(report);
}
