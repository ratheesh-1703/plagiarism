"use client";

import { useEffect, useMemo, useState } from "react";

import Shell from "@/components/Shell";
import { apiRequest, getToken } from "@/lib/api";

type SourceItem = {
  source_id: number;
  report_id: number;
  created_at: string;
  platform: string;
  title: string;
  url: string;
  matched_percentage: number;
  snippet?: string;
};

type CrawlJob = {
  crawl_job_id: number;
  query: string;
  max_results: number;
  providers_requested: string[];
  providers_used: string[];
  status: "queued" | "running" | "completed" | "failed";
  processed: number;
  ingested: number;
  duplicates: number;
  error?: string;
  created_at: string;
};

type BenchmarkRun = {
  benchmark_run_id: number;
  threshold: number;
  precision: number;
  recall: number;
  f1_score: number;
  total_cases: number;
  created_at: string;
};

const platformOptions = ["All", "IEEE", "Scopus", "Scopus/Elsevier", "Crossref", "OpenAlex"];
const discoverProviders = ["openalex", "crossref", "wikipedia", "ieee", "elsevier"];

export default function SourcesPage() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [platform, setPlatform] = useState("All");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ingestText, setIngestText] = useState("");
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestPlatform, setIngestPlatform] = useState("External Source");
  const [ingestUrl, setIngestUrl] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("plagiarism detection semantic similarity");
  const [discoverLimit, setDiscoverLimit] = useState(15);
  const [discoverProvidersSelected, setDiscoverProvidersSelected] = useState<string[]>(["openalex", "crossref", "wikipedia"]);
  const [busyDiscover, setBusyDiscover] = useState(false);
  const [crawlJobs, setCrawlJobs] = useState<CrawlJob[]>([]);
  const [busyCrawl, setBusyCrawl] = useState(false);
  const [benchmarkRuns, setBenchmarkRuns] = useState<BenchmarkRun[]>([]);
  const [benchmarkThreshold, setBenchmarkThreshold] = useState(60);
  const [busyBenchmark, setBusyBenchmark] = useState(false);
  const [busyCalibrate, setBusyCalibrate] = useState(false);
  const token = useMemo(() => getToken(), []);

  async function loadSources() {
    if (!token) {
      setError("Login first to load source matches.");
      return;
    }

    try {
      const suffix = platform === "All" ? "" : `?platform=${encodeURIComponent(platform)}`;
      const result = await apiRequest<{ items: SourceItem[] }>(`/sources${suffix}`, {}, token);
      setItems(result.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    }
  }

  async function loadCrawlJobs() {
    if (!token) return;
    try {
      const result = await apiRequest<{ items: CrawlJob[] }>("/crawl-jobs", {}, token);
      setCrawlJobs(result.items);
    } catch {
      setCrawlJobs([]);
    }
  }

  async function loadBenchmarks() {
    if (!token) return;
    try {
      const result = await apiRequest<{ runs: BenchmarkRun[] }>("/benchmarks/run", {}, token);
      setBenchmarkRuns(result.runs);
    } catch {
      setBenchmarkRuns([]);
    }
  }

  useEffect(() => {
    loadSources();
    loadCrawlJobs();
    loadBenchmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  async function handleIngest() {
    if (!token) {
      setError("Login first to ingest sources.");
      return;
    }

    if (ingestText.trim().length < 40) {
      setError("Source text must be at least 40 characters.");
      return;
    }

    try {
      await apiRequest<{ item: SourceItem }>(
        "/sources",
        {
          method: "POST",
          body: JSON.stringify({
            platform: ingestPlatform,
            title: ingestTitle,
            url: ingestUrl,
            text: ingestText,
          }),
        },
        token,
      );
      setIngestText("");
      setIngestTitle("");
      setIngestUrl("");
      setError("");
      await loadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest source");
    }
  }

  async function handleDiscoverOnline() {
    if (!token) {
      setError("Login first to discover online sources.");
      return;
    }

    if (discoverQuery.trim().length < 3) {
      setError("Enter a query with at least 3 characters.");
      return;
    }

    setBusyDiscover(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ discovered: number; ingested: number }>(
        "/sources/discover",
        {
          method: "POST",
          body: JSON.stringify({
            query: discoverQuery,
            maxResults: discoverLimit,
            providers: discoverProvidersSelected,
          }),
        },
        token,
      );
      await loadSources();
      setNotice(`Discovered ${result.discovered} online sources and ingested ${result.ingested} entries.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Online discovery failed");
    } finally {
      setBusyDiscover(false);
    }
  }

  async function handleQueueCrawlJob() {
    if (!token) {
      setError("Login first to queue crawl jobs.");
      return;
    }

    setBusyCrawl(true);
    setError("");
    try {
      await apiRequest<{ item: CrawlJob }>(
        "/crawl-jobs",
        {
          method: "POST",
          body: JSON.stringify({
            query: discoverQuery,
            max_results: Math.max(10, discoverLimit * 4),
            providers: discoverProvidersSelected,
            auto_run: true,
          }),
        },
        token,
      );
      await loadCrawlJobs();
      setNotice("Async crawl job queued. Refresh jobs in a few seconds.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue crawl job");
    } finally {
      setBusyCrawl(false);
    }
  }

  async function handleRunBenchmark() {
    if (!token) {
      setError("Login first to run benchmark.");
      return;
    }

    setBusyBenchmark(true);
    setError("");
    try {
      await apiRequest<{ run: BenchmarkRun }>(
        "/benchmarks/run",
        {
          method: "POST",
          body: JSON.stringify({ threshold: benchmarkThreshold }),
        },
        token,
      );
      await loadBenchmarks();
      setNotice("Benchmark run completed. Precision/recall metrics updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benchmark run failed");
    } finally {
      setBusyBenchmark(false);
    }
  }

  async function handleCalibrateTo93() {
    if (!token) {
      setError("Login first to calibrate threshold.");
      return;
    }

    setBusyCalibrate(true);
    setError("");
    try {
      const result = await apiRequest<{ selected_threshold_percent: number; metrics: { precision: number; recall: number; f1: number } }>(
        "/benchmarks/calibrate",
        {
          method: "POST",
          body: JSON.stringify({ target_precision: 0.93 }),
        },
        token,
      );
      setNotice(`Calibration complete. Threshold ${result.selected_threshold_percent}% | Precision ${result.metrics.precision} | Recall ${result.metrics.recall} | F1 ${result.metrics.f1}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calibration failed");
    } finally {
      setBusyCalibrate(false);
    }
  }

  return (
    <Shell>
      <section className="space-y-6">
        <article className="panel p-6">
          <h3 className="mb-3 text-lg font-black">Discover Online Sources</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <input
              className="input md:col-span-2"
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              placeholder="Search query (e.g., machine learning ethics plagiarism)"
            />
            <input
              type="number"
              min={3}
              max={50}
              className="input"
              value={discoverLimit}
              onChange={(e) => setDiscoverLimit(Math.max(3, Math.min(50, Number(e.target.value) || 15)))}
              placeholder="Max results"
            />
            <button className="btn-primary" disabled={busyDiscover} onClick={handleDiscoverOnline}>
              {busyDiscover ? "Discovering..." : "Discover and ingest"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {discoverProviders.map((provider) => {
              const selected = discoverProvidersSelected.includes(provider);
              return (
                <button
                  key={provider}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold ${selected ? "border-petrol bg-petrol text-white" : "border-slate-300 bg-white text-slate-700"}`}
                  onClick={() => {
                    setDiscoverProvidersSelected((prev) => selected ? prev.filter((p) => p !== provider) : [...prev, provider]);
                  }}
                >
                  {provider}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" disabled={busyCrawl} onClick={handleQueueCrawlJob}>
              {busyCrawl ? "Queueing..." : "Queue async crawl job"}
            </button>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={loadCrawlJobs}>Refresh jobs</button>
          </div>
          <p className="mt-2 text-xs text-slate-600">Sources are fetched from OpenAlex/Crossref/Wikipedia plus optional licensed IEEE and Elsevier APIs when keys are configured.</p>
        </article>

        <article className="panel p-6">
          <h3 className="mb-3 text-lg font-black">Crawl Job Status</h3>
          {crawlJobs.length === 0 ? (
            <p className="text-sm text-slate-600">No crawl jobs yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {crawlJobs.slice(0, 8).map((job) => (
                <div key={job.crawl_job_id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="font-semibold">Job #{job.crawl_job_id} - {job.status.toUpperCase()}</p>
                  <p>Query: {job.query}</p>
                  <p>Processed: {job.processed} | Ingested: {job.ingested} | Duplicates: {job.duplicates}</p>
                  {job.error && <p className="text-red-700">Error: {job.error}</p>}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel p-6">
          <h3 className="mb-3 text-lg font-black">Benchmark Precision/Recall</h3>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              value={benchmarkThreshold}
              className="input w-36"
              onChange={(e) => setBenchmarkThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 60)))}
            />
            <button className="btn-primary" onClick={handleRunBenchmark} disabled={busyBenchmark}>
              {busyBenchmark ? "Running..." : "Run benchmark"}
            </button>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={handleCalibrateTo93} disabled={busyCalibrate}>
              {busyCalibrate ? "Calibrating..." : "Calibrate to 93% precision"}
            </button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {benchmarkRuns.slice(0, 5).map((run) => (
              <div key={run.benchmark_run_id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-semibold">Run #{run.benchmark_run_id} (threshold {run.threshold}%)</p>
                <p>Precision: {run.precision} | Recall: {run.recall} | F1: {run.f1_score} | Cases: {run.total_cases}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">Tip: use calibrate to target 93% precision on your benchmark data (endpoint: /api/benchmarks/calibrate).</p>
        </article>

        <article className="panel p-6">
          <h3 className="mb-3 text-lg font-black">Ingest Verifiable Source</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input"
              value={ingestTitle}
              onChange={(e) => setIngestTitle(e.target.value)}
              placeholder="Source title"
            />
            <input
              className="input"
              value={ingestPlatform}
              onChange={(e) => setIngestPlatform(e.target.value)}
              placeholder="Platform (e.g., IEEE, Scopus, Website)"
            />
            <input
              className="input md:col-span-2"
              value={ingestUrl}
              onChange={(e) => setIngestUrl(e.target.value)}
              placeholder="Source URL (optional)"
            />
            <textarea
              className="input min-h-32 md:col-span-2"
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="Paste source text to index for evidence-backed matching..."
            />
          </div>
          <button className="btn-primary mt-3" onClick={handleIngest}>Ingest source</button>
        </article>

        <article className="panel p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">Published Source Explorer</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="platform" className="text-sm font-semibold">Platform</label>
              <select
                id="platform"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {platformOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="mb-3 text-sm font-semibold text-red-700">{error}</p>}
          {notice && <p className="mb-3 text-sm font-semibold text-emerald-700">{notice}</p>}
          {!error && items.length === 0 && (
            <p className="text-sm text-slate-600">No source matches found yet. Run plagiarism checks first.</p>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="pb-2 pr-3">Platform</th>
                    <th className="pb-2 pr-3">Title</th>
                    <th className="pb-2 pr-3">Evidence Snippet</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={`${item.report_id}-${idx}`} className="border-b border-slate-200 bg-white/80">
                      <td className="py-3 pr-3 font-semibold">{item.platform}</td>
                      <td className="py-3 pr-3">
                        {item.url ? (
                          <a className="text-petrol underline" href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a>
                        ) : (
                          <span>{item.title}</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">{item.snippet || "-"}</td>
                      <td className="py-3">{new Date(item.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </Shell>
  );
}
