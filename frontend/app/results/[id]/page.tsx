"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import Heatmap from "@/components/Heatmap";
import AiShareChart from "@/components/AiShareChart";
import PublishedMatchesChart from "@/components/PublishedMatchesChart";
import Shell from "@/components/Shell";
import { apiRequest, buildApiUrl, getToken } from "@/lib/api";

type SentencePair = {
  source_sentence: string;
  target_sentence: string;
  score: number;
  flagged: boolean;
};

type AiSentenceSignal = {
  source_sentence: string;
  target_sentence: string;
  score: number;
  ngram_overlap: number;
  label: "ai_humanized_likely" | "direct_copy_likely";
};

type Report = {
  report_id: number;
  created_at: string;
  expires_at?: string;
  summary: {
    overall_similarity: number;
    plagiarism_score: number;
    direct_copy_percentage?: number;
    flagged_pairs: number;
    total_pairs: number;
    tfidf_similarity: number;
    threshold: number;
    ai_rewrite_likelihood?: number;
    ai_involvement_percentage?: number;
    human_written_percentage?: number;
    perplexity_proxy?: number;
    token_entropy?: number;
    sentence_burstiness?: number;
    type_token_ratio?: number;
    humanized_by_ai_detected?: boolean;
    humanized_reason?: string;
    published_max_similarity?: number;
    published_check_status?: string;
    published_check_message?: string;
  };
  sentence_pairs: SentencePair[];
  direct_copy_pairs?: SentencePair[];
  ai_sentence_signals?: AiSentenceSignal[];
  published_source_matches?: Array<{
    source_id?: number;
    platform: string;
    title: string;
    url: string;
    matched_percentage: number;
    matched_sentences?: Array<{
      source_sentence: string;
      matched_chunk: string;
      score: number;
      source_sentence_index: number;
      chunk_id: number;
    }>;
  }>;
  source_evidence_matches?: Array<{
    source_id: number;
    platform: string;
    title: string;
    url: string;
    matched_percentage: number;
    matched_sentences: Array<{
      source_sentence: string;
      matched_chunk: string;
      score: number;
      source_sentence_index: number;
      chunk_id: number;
    }>;
  }>;
  audit?: {
    created_by_user_id: number;
    source_text_checksum: string;
    comparison_text_checksum: string;
    indexed_sources_considered: number;
    providers_used: string[];
    benchmarkable_version: string;
    generated_at: string;
  };
  similarity_matrix: number[][];
};

type AnalysisConfig = {
  threshold_percent: number;
  source: "default" | "calibrated";
};

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig | null>(null);
  const [error, setError] = useState("");

  async function handleDownload() {
    const token = getToken();
    if (!token || !report || report.report_id === 0) return;

    const response = await fetch(buildApiUrl(`/results/${report.report_id}/download`), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setError("Failed to download report");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${report.report_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    async function load() {
      const token = getToken();
      if (!token) {
        setError("Missing token. Login first.");
        return;
      }
      try {
        const result = await apiRequest<Report>(`/results/${params.id}`, {}, token);
        setReport(result);
        const config = await apiRequest<AnalysisConfig>("/analysis-config", {}, token);
        setAnalysisConfig(config);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      }
    }
    load();
  }, [params.id]);

  return (
    <Shell>
      {!report && !error && <p>Loading report...</p>}
      {error && <p className="text-red-700">{error}</p>}

      {report && (
        <section className="space-y-6">
          {analysisConfig && (
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm font-semibold text-slate-700">
              Active analysis threshold: {analysisConfig.threshold_percent}% ({analysisConfig.source})
            </div>
          )}

          <article className="panel grid gap-4 p-6 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-600">Overall Similarity</p>
              <p className="text-4xl font-black text-slateNight">{report.summary.overall_similarity}%</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Plagiarism Score</p>
              <p className="text-4xl font-black text-coral">{report.summary.plagiarism_score}%</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">TF-IDF Baseline</p>
              <p className="text-4xl font-black text-petrol">{report.summary.tfidf_similarity}%</p>
            </div>
          </article>

          <article className="panel grid gap-4 p-6 md:grid-cols-4">
            <div>
              <p className="text-sm text-slate-600">AI Involvement</p>
              <p className="text-3xl font-black text-slateNight">{report.summary.ai_involvement_percentage ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">AI Rewrite Likelihood</p>
              <p className="text-3xl font-black text-coral">{report.summary.ai_rewrite_likelihood ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Direct Copy</p>
              <p className="text-3xl font-black text-petrol">{report.summary.direct_copy_percentage ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Published Match</p>
              <p className="text-3xl font-black text-slateNight">{report.summary.published_max_similarity ?? 0}%</p>
            </div>
            <div className="md:col-span-4 rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
              <p className="font-semibold">
                Humanized by AI: {report.summary.humanized_by_ai_detected ? "Yes" : "No"}
              </p>
              <p>{report.summary.humanized_reason || "No explanation available."}</p>
              {report.summary.published_check_message && (
                <p className="mt-1 text-slate-600">Published source check: {report.summary.published_check_message}</p>
              )}
            </div>
          </article>

          <article className="panel grid gap-4 p-6 md:grid-cols-2">
            <div>
              <h2 className="mb-3 text-xl font-black">AI vs Human Content Share</h2>
              <AiShareChart
                aiPercentage={report.summary.ai_involvement_percentage ?? 0}
                humanPercentage={report.summary.human_written_percentage ?? 100}
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-4 text-sm">
              <h3 className="text-lg font-black">Stylometric Signals</h3>
              <p>Perplexity proxy: <span className="font-semibold">{report.summary.perplexity_proxy ?? 0}</span></p>
              <p>Token entropy: <span className="font-semibold">{report.summary.token_entropy ?? 0}</span></p>
              <p>Sentence burstiness: <span className="font-semibold">{report.summary.sentence_burstiness ?? 0}</span></p>
              <p>Type-token ratio: <span className="font-semibold">{report.summary.type_token_ratio ?? 0}</span></p>
            </div>
          </article>

          <div>
            <button className="btn-primary" onClick={handleDownload} disabled={report.report_id === 0}>
              Download report
            </button>
          </div>

          <article className="panel rounded-xl border border-slate-200 bg-white/80 p-4 text-sm">
            <h3 className="mb-2 text-lg font-black">Audit and Retention</h3>
            <p>Report expires at: <span className="font-semibold">{report.expires_at ? new Date(report.expires_at).toLocaleString() : "not set"}</span></p>
            <p>Created by user: <span className="font-semibold">{report.audit?.created_by_user_id ?? "n/a"}</span></p>
            <p>Indexed sources considered: <span className="font-semibold">{report.audit?.indexed_sources_considered ?? 0}</span></p>
            <p>Providers used: <span className="font-semibold">{(report.audit?.providers_used || ["n/a"]).join(", ")}</span></p>
            <p>Version: <span className="font-semibold">{report.audit?.benchmarkable_version || "legacy"}</span></p>
            <p>Source checksum: <span className="font-mono text-xs">{report.audit?.source_text_checksum || "n/a"}</span></p>
            <p>Comparison checksum: <span className="font-mono text-xs">{report.audit?.comparison_text_checksum || "n/a"}</span></p>
          </article>

          <article className="panel p-6">
            <h2 className="mb-4 text-2xl font-black">Similarity Heatmap</h2>
            <Heatmap z={report.similarity_matrix} />
          </article>

          <article className="panel overflow-hidden p-6">
            <h2 className="mb-4 text-2xl font-black">Sentence Comparison Table</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="pb-2 pr-3">Source sentence</th>
                    <th className="pb-2 pr-3">Matched sentence</th>
                    <th className="pb-2 pr-3">Score</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sentence_pairs.map((pair, idx) => (
                    <tr key={idx} className={`border-b border-slate-200 ${pair.flagged ? "bg-amber-100/80" : "bg-white/80"}`}>
                      <td className="py-3 pr-3 align-top">{pair.source_sentence}</td>
                      <td className="py-3 pr-3 align-top">{pair.target_sentence}</td>
                      <td className="py-3 pr-3 align-top font-semibold">{pair.score}</td>
                      <td className="py-3 align-top font-semibold">{pair.flagged ? "Flagged" : "Safe"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel overflow-hidden p-6">
            <h2 className="mb-4 text-2xl font-black">Direct Copy-Paste Sentences</h2>
            {(report.direct_copy_pairs || []).length === 0 ? (
              <p className="text-sm text-slate-600">No direct copy-paste sentence pairs detected.</p>
            ) : (
              <div className="space-y-3">
                {(report.direct_copy_pairs || []).map((pair, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
                    <p><span className="font-semibold">Source:</span> {pair.source_sentence}</p>
                    <p><span className="font-semibold">Matched:</span> {pair.target_sentence}</p>
                    <p><span className="font-semibold">Similarity:</span> {pair.score}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel overflow-hidden p-6">
            <h2 className="mb-4 text-2xl font-black">AI-Humanized Sentence Signals</h2>
            {(report.ai_sentence_signals || []).length === 0 ? (
              <p className="text-sm text-slate-600">No strong AI-humanized sentence signals detected in this report.</p>
            ) : (
              <div className="space-y-3">
                {(report.ai_sentence_signals || []).map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
                    <p><span className="font-semibold">Type:</span> {item.label === "ai_humanized_likely" ? "AI-humanized likely" : "Direct copy likely"}</p>
                    <p><span className="font-semibold">Source:</span> {item.source_sentence}</p>
                    <p><span className="font-semibold">Matched:</span> {item.target_sentence}</p>
                    <p><span className="font-semibold">Semantic score:</span> {item.score} | <span className="font-semibold">N-gram overlap:</span> {item.ngram_overlap}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel overflow-hidden p-6">
            <h2 className="mb-4 text-2xl font-black">Verifiable Source Evidence</h2>
            {(report.source_evidence_matches || []).length === 0 ? (
              <p className="text-sm text-slate-600">No indexed-source evidence was found. Ingest sources in the Sources page and re-run analysis.</p>
            ) : (
              <div className="space-y-3">
                <PublishedMatchesChart matches={report.source_evidence_matches || []} />
                {(report.source_evidence_matches || []).map((source, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
                    <p className="font-semibold">{source.platform}: {source.title} (ID: {source.source_id})</p>
                    <p>Matched percentage: {source.matched_percentage}%</p>
                    {source.url && (
                      <a className="text-petrol underline" href={source.url} target="_blank" rel="noreferrer">Open source</a>
                    )}
                    {(source.matched_sentences || []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        {source.matched_sentences.slice(0, 3).map((evidence) => (
                          <div key={`${source.source_id}-${evidence.chunk_id}-${evidence.source_sentence_index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <p><span className="font-semibold">Your sentence:</span> {evidence.source_sentence}</p>
                            <p><span className="font-semibold">Matched chunk:</span> {evidence.matched_chunk}</p>
                            <p><span className="font-semibold">Score:</span> {evidence.score} | <span className="font-semibold">Chunk ID:</span> {evidence.chunk_id}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}
    </Shell>
  );
}
