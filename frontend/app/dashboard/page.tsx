"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Shell from "@/components/Shell";
import { apiRequest, buildApiUrl, getToken } from "@/lib/api";

type UploadResponse = {
  document_id: number;
  filename: string;
  text_preview: string;
  extraction_warning?: string;
};

type HistoryItem = {
  report_id: number;
  created_at: string;
  overall_similarity: number;
  plagiarism_score: number;
};

type AnalysisConfig = {
  threshold_percent: number;
  source: "default" | "calibrated";
};

export default function DashboardPage() {
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [additionalCorpus, setAdditionalCorpus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadedDocId, setUploadedDocId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig | null>(null);
  const router = useRouter();

  const token = useMemo(() => getToken(), []);

  async function loadHistory() {
    if (!token) return;
    try {
      const response = await apiRequest<{ items: HistoryItem[] }>("/history", {}, token);
      setHistory(response.items);
    } catch {
      setHistory([]);
    }
  }

  async function loadAnalysisConfig() {
    if (!token) return;
    try {
      const response = await apiRequest<AnalysisConfig>("/analysis-config", {}, token);
      setAnalysisConfig(response);
    } catch {
      setAnalysisConfig(null);
    }
  }

  useEffect(() => {
    loadHistory();
    loadAnalysisConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload() {
    if (!token || !file) return;
    setError("");
    setUploadNotice("");
    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(buildApiUrl("/upload-document"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }
      const uploaded: UploadResponse = await response.json();
      setUploadedDocId(uploaded.document_id);
      if (uploaded.text_preview?.trim()) {
        setSourceText(uploaded.text_preview);
      }
      if (uploaded.extraction_warning) {
        setUploadNotice(uploaded.extraction_warning);
      } else {
        setUploadNotice("Document uploaded successfully.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDroppedFile(dropped: File | null) {
    if (!dropped) return;
    const allowed = ["text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const ext = dropped.name.split(".").pop()?.toLowerCase() || "";
    if (!allowed.includes(dropped.type) && !["txt", "pdf", "docx"].includes(ext)) {
      setError("Unsupported file format. Use PDF, DOCX, or TXT.");
      return;
    }
    setError("");
    setFile(dropped);
  }

  async function handleAnalyze() {
    if (!token) {
      router.push("/login");
      return;
    }

    setError("");
    setUploadNotice("");
    setLoading(true);

    try {
      const compareAgainst = additionalCorpus
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length >= 20);

      const payload = uploadedDocId
        ? { source_document_id: uploadedDocId, source_text: sourceText, comparison_text: targetText, compare_against: compareAgainst }
        : { source_text: sourceText, comparison_text: targetText, compare_against: compareAgainst };

      const response = await apiRequest<{ report_id: number }>("/check-plagiarism", {
        method: "POST",
        body: JSON.stringify(payload),
      }, token);
      router.push(`/results/${response.report_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
      loadHistory();
    }
  }

  return (
    <Shell>
      <section className="grid gap-6 lg:grid-cols-3">
        <article className="panel p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">Check plagiarism</h2>
            {analysisConfig && (
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                Threshold: {analysisConfig.threshold_percent}% ({analysisConfig.source})
              </span>
            )}
          </div>
          <div
            className={`mb-4 rounded-2xl border-2 border-dashed p-4 transition ${dragActive ? "border-coral bg-amber-50" : "border-slate-300 bg-white/70"}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleDroppedFile(e.dataTransfer.files?.[0] || null);
            }}
          >
            <p className="mb-3 text-sm font-semibold text-slate-700">Drag and drop PDF, DOCX, or TXT here</p>
            <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".txt,.pdf,.docx"
              onChange={(e) => handleDroppedFile(e.target.files?.[0] || null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
            <button className="btn-primary" onClick={handleUpload} disabled={loading || !file}>Upload document</button>
            {file && <p className="text-sm text-slate-700">Selected: <span className="font-semibold">{file.name}</span></p>}
            </div>
          </div>

          <label className="mb-2 block text-sm font-semibold">Source text</label>
          <textarea className="input mb-4 min-h-40" value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="Paste source text or upload file..." />

          <label className="mb-2 block text-sm font-semibold">Comparison text (optional)</label>
          <textarea className="input min-h-40" value={targetText} onChange={(e) => setTargetText(e.target.value)} placeholder="Optional: paste custom text. Leave empty to auto-compare against available sources." />

          <label className="mb-2 mt-4 block text-sm font-semibold">Additional reference corpus (optional, one text per line)</label>
          <textarea className="input min-h-24" value={additionalCorpus} onChange={(e) => setAdditionalCorpus(e.target.value)} placeholder="Add extra publication snippets for multiple-document comparison..." />

          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          {uploadNotice && <p className="mt-3 text-sm font-semibold text-amber-700">{uploadNotice}</p>}
          <button className="btn-primary mt-4" onClick={handleAnalyze} disabled={loading || (!sourceText && !uploadedDocId)}>
            {loading ? "Analyzing..." : "Run semantic plagiarism check"}
          </button>
        </article>

        <aside className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-black">History</h3>
            <button onClick={loadHistory} className="rounded-lg bg-slateNight px-3 py-2 text-sm font-semibold text-white">Refresh</button>
          </div>
          <div className="space-y-3">
            {history.length === 0 && <p className="text-sm text-slate-600">No reports yet.</p>}
            {history.map((item) => (
              <button key={item.report_id} onClick={() => router.push(`/results/${item.report_id}`)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left">
                <p className="font-semibold">Report #{item.report_id}</p>
                <p className="text-sm">Similarity: {item.overall_similarity}%</p>
                <p className="text-sm">Plagiarism: {item.plagiarism_score}%</p>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </Shell>
  );
}
