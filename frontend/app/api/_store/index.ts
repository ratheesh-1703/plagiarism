import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

type User = { id: number; name: string; email: string; password: string; created_at: string };
type ReportSummary = {
  overall_similarity: number;
  plagiarism_score: number;
  direct_copy_percentage: number;
  flagged_pairs: number;
  total_pairs: number;
  tfidf_similarity: number;
  threshold: number;
  multiple_document_max_similarity: number;
  ai_rewrite_likelihood: number;
  ai_involvement_percentage: number;
  human_written_percentage: number;
  perplexity_proxy: number;
  token_entropy: number;
  sentence_burstiness: number;
  type_token_ratio: number;
  humanized_by_ai_detected: boolean;
  humanized_reason: string;
  published_max_similarity: number;
  published_check_status: string;
  published_check_message: string;
};
type SentencePair = {
  source_sentence: string;
  target_sentence: string;
  score: number;
  flagged: boolean;
};

export type CandidateSource = {
  source_id?: number;
  platform: string;
  title: string;
  url: string;
  text: string;
};

export type SourceMatchEvidence = {
  source_sentence: string;
  matched_chunk: string;
  score: number;
  source_sentence_index: number;
  chunk_id: number;
};

export type SourceEvidenceMatch = {
  source_id: number;
  platform: string;
  title: string;
  url: string;
  matched_percentage: number;
  matched_sentences: SourceMatchEvidence[];
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
  owner_id: number;
  created_at: string;
  expires_at?: string;
  summary: ReportSummary;
  sentence_pairs: SentencePair[];
  direct_copy_pairs: SentencePair[];
  ai_sentence_signals: AiSentenceSignal[];
  published_source_matches?: Array<{
    platform: string;
    title: string;
    url: string;
    matched_percentage: number;
    source_id?: number;
    matched_sentences?: SourceMatchEvidence[];
  }>;
  source_evidence_matches?: SourceEvidenceMatch[];
  audit: ReportAuditMetadata;
  similarity_matrix: number[][];
  source_text: string;
  comparison_text: string;
};

export type ReportAuditMetadata = {
  created_by_user_id: number;
  source_text_checksum: string;
  comparison_text_checksum: string;
  source_text_length: number;
  comparison_text_length: number;
  indexed_sources_considered: number;
  providers_used: string[];
  benchmarkable_version: string;
  generated_at: string;
};
type DocumentItem = {
  document_id: number;
  owner_id: number;
  filename: string;
  text: string;
};

type InMemoryStore = {
  users: User[];
  documents: DocumentItem[];
  reports: Report[];
  indexedSources: IndexedSource[];
  sourceChunks: SourceChunk[];
  crawlJobs: CrawlJob[];
  benchmarkRuns: BenchmarkRun[];
  benchmarkDatasets: BenchmarkCase[];
  observabilityLogs: ProviderObservabilityLog[];
  userAnalysisThresholds: Array<{ owner_id: number; threshold: number; updated_at: string }>;
  nextUserId: number;
  nextDocId: number;
  nextReportId: number;
  nextSourceId: number;
  nextChunkId: number;
  nextCrawlJobId: number;
  nextBenchmarkRunId: number;
  nextLogId: number;
};

export type CrawlJob = {
  crawl_job_id: number;
  owner_id: number;
  query: string;
  max_results: number;
  providers_requested: string[];
  providers_used: string[];
  status: "queued" | "running" | "completed" | "failed";
  processed: number;
  ingested: number;
  duplicates: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
};

export type BenchmarkCase = {
  id: string;
  owner_id?: number;
  source_text: string;
  candidate_text: string;
  expected_plagiarism: boolean;
  domain?: string;
};

export type BenchmarkRun = {
  benchmark_run_id: number;
  owner_id: number;
  threshold: number;
  total_cases: number;
  true_positive: number;
  false_positive: number;
  true_negative: number;
  false_negative: number;
  precision: number;
  recall: number;
  f1_score: number;
  domain: string;
  per_domain?: Array<{
    domain: string;
    total_cases: number;
    precision: number;
    recall: number;
    f1_score: number;
  }>;
  created_at: string;
};
export type ProviderObservabilityLog = {
  log_id: number;
  owner_id: number;
  provider: string;
  endpoint: string;
  status: "success" | "retry" | "failure" | "throttled";
  attempt: number;
  http_status?: number;
  duration_ms: number;
  message: string;
  created_at: string;
};

export type IndexedSource = {
  source_id: number;
  owner_id: number;
  platform: string;
  title: string;
  url: string;
  text: string;
  checksum: string;
  created_at: string;
  updated_at: string;
};

type SourceChunk = {
  chunk_id: number;
  source_id: number;
  owner_id: number;
  text: string;
  tokens: string[];
  created_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __plagiarismStore: InMemoryStore | undefined;
}

const STORE_PATH = join(process.cwd(), ".data", "plagiarism-store.json");
const STORE_PATH_TMP = join(process.cwd(), ".data", "plagiarism-store.json.tmp");
const STORE_PATH_BAK = join(process.cwd(), ".data", "plagiarism-store.json.bak");

const MOCK_PUBLISHED_SOURCES: CandidateSource[] = [
  {
    platform: "Internet Website",
    title: "Open Educational Resource - Academic Writing",
    url: "https://example.org/academic-writing",
    text: "Academic writing requires clarity, coherence, and proper citation of sources. Paraphrasing should preserve original meaning while avoiding direct copying.",
  },
  {
    platform: "Journal",
    title: "Semantic Similarity for Plagiarism Detection",
    url: "https://example.org/semantic-plagiarism-journal",
    text: "Semantic plagiarism detection compares sentence meaning instead of exact words. Cosine similarity and contextual embeddings can identify paraphrased overlap.",
  },
  {
    platform: "Book",
    title: "Research Methodology Handbook",
    url: "https://example.org/research-methods-book",
    text: "Research integrity requires proper attribution, transparent methodology, and reproducible reporting. Ethical scholarship avoids unattributed reuse of text.",
  },
  {
    platform: "Research Database",
    title: "Open Research Archive Entry",
    url: "https://example.org/open-research-archive",
    text: "Automated writing detectors rely on stylometric patterns such as burstiness, lexical diversity, and sentence uniformity to estimate AI involvement.",
  },
];

function createStore(): InMemoryStore {
  return {
    users: [],
    documents: [],
    reports: [],
    indexedSources: [],
    sourceChunks: [],
    crawlJobs: [],
    benchmarkRuns: [],
    benchmarkDatasets: [],
    observabilityLogs: [],
    userAnalysisThresholds: [],
    nextUserId: 1,
    nextDocId: 1,
    nextReportId: 1,
    nextSourceId: 1,
    nextChunkId: 1,
    nextCrawlJobId: 1,
    nextBenchmarkRunId: 1,
    nextLogId: 1,
  };
}

function normalizeStore(parsed: Partial<InMemoryStore>): InMemoryStore | null {
  if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.documents) || !Array.isArray(parsed.reports)) {
    return null;
  }

  const indexedSources = Array.isArray((parsed as Partial<InMemoryStore>).indexedSources)
    ? (parsed as Partial<InMemoryStore>).indexedSources as IndexedSource[]
    : [];
  const sourceChunks = Array.isArray((parsed as Partial<InMemoryStore>).sourceChunks)
    ? (parsed as Partial<InMemoryStore>).sourceChunks as SourceChunk[]
    : [];
  const crawlJobs = Array.isArray((parsed as Partial<InMemoryStore>).crawlJobs)
    ? (parsed as Partial<InMemoryStore>).crawlJobs as CrawlJob[]
    : [];
  const benchmarkRuns = Array.isArray((parsed as Partial<InMemoryStore>).benchmarkRuns)
    ? (parsed as Partial<InMemoryStore>).benchmarkRuns as BenchmarkRun[]
    : [];
  const benchmarkDatasets = Array.isArray((parsed as Partial<InMemoryStore>).benchmarkDatasets)
    ? (parsed as Partial<InMemoryStore>).benchmarkDatasets as BenchmarkCase[]
    : [];
  const observabilityLogs = Array.isArray((parsed as Partial<InMemoryStore>).observabilityLogs)
    ? (parsed as Partial<InMemoryStore>).observabilityLogs as ProviderObservabilityLog[]
    : [];
  const userAnalysisThresholds = Array.isArray((parsed as Partial<InMemoryStore>).userAnalysisThresholds)
    ? (parsed as Partial<InMemoryStore>).userAnalysisThresholds as Array<{ owner_id: number; threshold: number; updated_at: string }>
    : [];

  const maxSourceId = indexedSources.reduce((max, src) => Math.max(max, Number(src.source_id) || 0), 0);
  const maxChunkId = sourceChunks.reduce((max, chunk) => Math.max(max, Number(chunk.chunk_id) || 0), 0);
  const maxCrawlJobId = crawlJobs.reduce((max, job) => Math.max(max, Number(job.crawl_job_id) || 0), 0);
  const maxBenchmarkRunId = benchmarkRuns.reduce((max, run) => Math.max(max, Number(run.benchmark_run_id) || 0), 0);
  const maxLogId = observabilityLogs.reduce((max, log) => Math.max(max, Number(log.log_id) || 0), 0);

  return {
    users: parsed.users,
    documents: parsed.documents,
    reports: parsed.reports,
    indexedSources,
    sourceChunks,
    crawlJobs,
    benchmarkRuns,
    benchmarkDatasets,
    observabilityLogs,
    userAnalysisThresholds,
    nextUserId: Number(parsed.nextUserId) || (parsed.users.length + 1),
    nextDocId: Number(parsed.nextDocId) || (parsed.documents.length + 1),
    nextReportId: Number(parsed.nextReportId) || (parsed.reports.length + 1),
    nextSourceId: Number((parsed as Partial<InMemoryStore>).nextSourceId) || (maxSourceId + 1 || 1),
    nextChunkId: Number((parsed as Partial<InMemoryStore>).nextChunkId) || (maxChunkId + 1 || 1),
    nextCrawlJobId: Number((parsed as Partial<InMemoryStore>).nextCrawlJobId) || (maxCrawlJobId + 1 || 1),
    nextBenchmarkRunId: Number((parsed as Partial<InMemoryStore>).nextBenchmarkRunId) || (maxBenchmarkRunId + 1 || 1),
    nextLogId: Number((parsed as Partial<InMemoryStore>).nextLogId) || (maxLogId + 1 || 1),
  };
}

function parseStoreJson(raw: string): Partial<InMemoryStore> | null {
  try {
    // Handle BOM-prefixed files created by some Windows editors/commands.
    const sanitized = raw.replace(/^\uFEFF/, "").trim();
    if (!sanitized) {
      return null;
    }
    return JSON.parse(sanitized) as Partial<InMemoryStore>;
  } catch {
    return null;
  }
}

function readStoreFromDisk(): InMemoryStore | null {
  try {
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, "utf8");
      const parsed = parseStoreJson(raw);
      if (!parsed) {
        throw new Error("Invalid main store JSON");
      }
      const normalized = normalizeStore(parsed);
      if (normalized) {
        return normalized;
      }
    }

    if (existsSync(STORE_PATH_BAK)) {
      const raw = readFileSync(STORE_PATH_BAK, "utf8");
      const parsed = parseStoreJson(raw);
      if (!parsed) {
        return null;
      }
      const normalized = normalizeStore(parsed);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  } catch {
    try {
      if (!existsSync(STORE_PATH_BAK)) {
        return null;
      }
      const raw = readFileSync(STORE_PATH_BAK, "utf8");
      const parsed = parseStoreJson(raw);
      if (!parsed) {
        return null;
      }
      return normalizeStore(parsed);
    } catch {
      return null;
    }
  }
}

export function persistStore(): void {
  try {
    const store = getStore();
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    const serialized = JSON.stringify(store, null, 2);

    writeFileSync(STORE_PATH_TMP, serialized, "utf8");
    renameSync(STORE_PATH_TMP, STORE_PATH);
    copyFileSync(STORE_PATH, STORE_PATH_BAK);
  } catch {
    // Ignore persistence errors in mock mode.
  }
}

export function getStore(): InMemoryStore {
  if (!global.__plagiarismStore) {
    global.__plagiarismStore = readStoreFromDisk() || createStore();
  }
  return global.__plagiarismStore;
}

export function getUserIdFromAuthHeader(authHeader: string | null): number | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token.startsWith("dev-token-")) return null;
  const userId = Number(token.replace("dev-token-", ""));
  return Number.isFinite(userId) ? userId : null;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isLikelyExtractionNoise(input: string): boolean {
  const line = input.trim();
  if (!line) return true;

  const hardPatterns = [
    /\/FlateDecode/i,
    /\bxref\b/i,
    /\btrailer\b/i,
    /%%EOF/i,
    /\bendobj\b/i,
    /\bobj\b/i,
    /\bstream\b/i,
    /\bendstream\b/i,
    /<\?xpacket/i,
    /<x:xmpmeta/i,
    /<rdf:RDF/i,
    /xmlns:/i,
    /\/Type\s*\//i,
    /\/FontDescriptor/i,
    /\/MediaBox/i,
    /\/Annot/i,
    /\/Page\b/i,
    /\/Resources\b/i,
  ];

  if (hardPatterns.some((rx) => rx.test(line))) {
    return true;
  }

  const hasTagNoise = /<[^>]{3,}>/.test(line);
  if (hasTagNoise) return true;

  if (line.length >= 24) {
    const alnumCount = (line.match(/[\p{L}\p{N}\s]/gu) || []).length;
    const ratio = alnumCount / line.length;
    if (ratio < 0.55) {
      return true;
    }
  }

  return false;
}

function isHeadingLikeMicroSentence(input: string): boolean {
  const s = input.trim();
  if (!s) return true;

  if (/^[A-Za-z0-9][.)-]?$/.test(s)) return true;
  if (/^[A-Za-z]\s*\.$/.test(s)) return true;
  if (/^\d+\s*[.)]$/.test(s)) return true;

  const words = tokenize(s);
  return words.length <= 2 && s.length <= 12;
}

function isMeaningfulSentence(input: string): boolean {
  const s = input.replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (isLikelyExtractionNoise(s)) return false;
  if (isHeadingLikeMicroSentence(s)) return false;

  const words = tokenize(s);
  if (words.length < 3) return false;
  if (s.length < 15) return false;
  return true;
}

function sampleArray<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const step = arr.length / maxLen;
  return Array.from({ length: maxLen }, (_, i) => arr[Math.floor(i * step)]);
}

export function sentenceSplit(text: string): string[] {
  const punctSplit = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const cleanedPunct = punctSplit.filter(isMeaningfulSentence);
  if (punctSplit.length > 1) {
    return cleanedPunct.length ? cleanedPunct : punctSplit.filter((s) => !isLikelyExtractionNoise(s));
  }

  const newlineSplit = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const cleanedNewline = newlineSplit.filter(isMeaningfulSentence);
  if (cleanedNewline.length) {
    return cleanedNewline;
  }
  return newlineSplit.filter((s) => !isLikelyExtractionNoise(s));
}

export function jaccard(a: string, b: string): number {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (!aSet.size || !bSet.size) return 0;
  const intersection = [...aSet].filter((x) => bSet.has(x)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return intersection / union;
}

function cosine(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;

  const aFreq = new Map<string, number>();
  const bFreq = new Map<string, number>();

  aTokens.forEach((t) => aFreq.set(t, (aFreq.get(t) || 0) + 1));
  bTokens.forEach((t) => bFreq.set(t, (bFreq.get(t) || 0) + 1));

  const terms = new Set([...aFreq.keys(), ...bFreq.keys()]);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  terms.forEach((t) => {
    const av = aFreq.get(t) || 0;
    const bv = bFreq.get(t) || 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  });

  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function ngrams(text: string, n = 3): string[] {
  const tokens = tokenize(text);
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function ngramJaccard(a: string, b: string, n = 3): number {
  const aSet = new Set(ngrams(a, n));
  const bSet = new Set(ngrams(b, n));
  if (!aSet.size || !bSet.size) return 0;
  const intersection = [...aSet].filter((x) => bSet.has(x)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union ? intersection / union : 0;
}

function pairScore(a: string, b: string): number {
  const semantic = cosine(a, b);
  const lexical = jaccard(a, b);
  const phrase = ngramJaccard(a, b, 3);
  return (0.55 * semantic) + (0.25 * lexical) + (0.2 * phrase);
}

function tokenEntropy(text: string): number {
  const tokens = tokenize(text);
  if (!tokens.length) return 0;

  const freq = new Map<string, number>();
  tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));

  let entropy = 0;
  freq.forEach((count) => {
    const p = count / tokens.length;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  });
  return entropy;
}

function perplexityProxy(text: string): number {
  return Math.pow(2, tokenEntropy(text));
}

function sentenceBurstiness(text: string): number {
  const sentences = sentenceSplit(text);
  if (!sentences.length) return 0;

  const lengths = sentences.map((s) => tokenize(s).length).filter((n) => n > 0);
  if (!lengths.length) return 0;

  const mean = lengths.reduce((acc, n) => acc + n, 0) / lengths.length;
  if (!mean) return 0;

  const variance = lengths.reduce((acc, n) => acc + ((n - mean) ** 2), 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

function sentenceLengthVariance(sentences: string[]): number {
  if (!sentences.length) return 0;
  const lengths = sentences.map((s) => tokenize(s).length);
  const mean = lengths.reduce((acc, n) => acc + n, 0) / lengths.length;
  if (!mean) return 0;
  const variance = lengths.reduce((acc, n) => acc + ((n - mean) ** 2), 0) / lengths.length;
  return Math.sqrt(variance);
}

function calcOverallSimilarity(sourceText: string, comparisonText: string): number {
  const sourceSentences = sentenceSplit(sourceText);
  const targetSentences = sentenceSplit(comparisonText);
  if (!sourceSentences.length || !targetSentences.length) return 0;

  const sampledSrc = sampleArray(sourceSentences, 80);
  const sampledTgt = sampleArray(targetSentences, 80);

  const bestScores = sampledSrc.map((src) => {
    let best = 0;
    sampledTgt.forEach((tgt) => {
      const score = pairScore(src, tgt);
      if (score > best) best = score;
    });
    return best;
  });

  return bestScores.reduce((acc, s) => acc + s, 0) / bestScores.length;
}

export function overallSimilarityPercent(sourceText: string, comparisonText: string): number {
  return Number((calcOverallSimilarity(sourceText, comparisonText) * 100).toFixed(2));
}

function reportRetentionDays(): number {
  const parsed = Number(process.env.REPORT_RETENTION_DAYS || "180");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 180;
  }
  return Math.floor(parsed);
}

export function enforceReportRetention(ownerId?: number): number {
  const store = getStore();
  const ttlDays = reportRetentionDays();
  const cutoff = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);
  const before = store.reports.length;

  store.reports = store.reports.filter((report) => {
    if (ownerId && report.owner_id !== ownerId) {
      return true;
    }
    const created = new Date(report.created_at).getTime();
    return Number.isFinite(created) && created >= cutoff;
  });

  const removed = before - store.reports.length;
  if (removed > 0) {
    persistStore();
  }
  return removed;
}

export function buildReportAuditMetadata(input: {
  ownerId: number;
  sourceText: string;
  comparisonText: string;
  indexedSourcesConsidered: number;
  providersUsed: string[];
}): ReportAuditMetadata {
  const sourceText = normalizeSourcePayloadText(input.sourceText);
  const comparisonText = normalizeSourcePayloadText(input.comparisonText);
  return {
    created_by_user_id: input.ownerId,
    source_text_checksum: sourceChecksum(sourceText),
    comparison_text_checksum: sourceChecksum(comparisonText),
    source_text_length: sourceText.length,
    comparison_text_length: comparisonText.length,
    indexed_sources_considered: input.indexedSourcesConsidered,
    providers_used: input.providersUsed,
    benchmarkable_version: "scoring-v2-indexed-evidence",
    generated_at: new Date().toISOString(),
  };
}

export function createCrawlJob(ownerId: number, query: string, maxResults: number, providersRequested: string[]): CrawlJob {
  const store = getStore();
  const job: CrawlJob = {
    crawl_job_id: store.nextCrawlJobId++,
    owner_id: ownerId,
    query,
    max_results: maxResults,
    providers_requested: providersRequested,
    providers_used: [],
    status: "queued",
    processed: 0,
    ingested: 0,
    duplicates: 0,
    created_at: new Date().toISOString(),
  };
  store.crawlJobs.push(job);
  persistStore();
  return job;
}

export function updateCrawlJob(jobId: number, patch: Partial<CrawlJob>): CrawlJob | null {
  const store = getStore();
  const idx = store.crawlJobs.findIndex((job) => job.crawl_job_id === jobId);
  if (idx < 0) return null;
  store.crawlJobs[idx] = { ...store.crawlJobs[idx], ...patch };
  persistStore();
  return store.crawlJobs[idx];
}

export function listCrawlJobs(ownerId: number): CrawlJob[] {
  return getStore().crawlJobs
    .filter((job) => job.owner_id === ownerId)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

export function getCrawlJob(ownerId: number, crawlJobId: number): CrawlJob | null {
  const store = getStore();
  return store.crawlJobs.find((job) => job.owner_id === ownerId && job.crawl_job_id === crawlJobId) || null;
}

export function claimNextQueuedCrawlJob(ownerId?: number): CrawlJob | null {
  const store = getStore();
  const queued = store.crawlJobs
    .filter((job) => job.status === "queued")
    .filter((job) => (ownerId ? job.owner_id === ownerId : true))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];

  if (!queued) return null;

  updateCrawlJob(queued.crawl_job_id, {
    status: "running",
    started_at: new Date().toISOString(),
    error: undefined,
  });
  return getCrawlJob(queued.owner_id, queued.crawl_job_id);
}

export function recordBenchmarkRun(ownerId: number, run: Omit<BenchmarkRun, "benchmark_run_id" | "owner_id" | "created_at">): BenchmarkRun {
  const store = getStore();
  const created: BenchmarkRun = {
    benchmark_run_id: store.nextBenchmarkRunId++,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
    ...run,
  };
  store.benchmarkRuns.push(created);
  persistStore();
  return created;
}

export function listBenchmarkRuns(ownerId: number): BenchmarkRun[] {
  return getStore().benchmarkRuns
    .filter((run) => run.owner_id === ownerId)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

export function replaceBenchmarkDataset(ownerId: number, domain: string, cases: BenchmarkCase[]): number {
  const store = getStore();
  const normalizedDomain = domain.trim().toLowerCase() || "general";
  const filtered = store.benchmarkDatasets.filter((c) => {
    const sameUser = (c.owner_id || 0) === ownerId;
    const sameDomain = (c.domain || "general").toLowerCase() === normalizedDomain;
    return !(sameUser && sameDomain);
  });
  const normalizedCases = cases.map((c, idx) => ({
    ...c,
    owner_id: ownerId,
    id: c.id || `${normalizedDomain}-${idx + 1}`,
    domain: normalizedDomain,
  }));
  store.benchmarkDatasets = [...filtered, ...normalizedCases];
  persistStore();
  return normalizedCases.length;
}

export function getBenchmarkDataset(ownerId: number, domain?: string): BenchmarkCase[] {
  const store = getStore();
  const userCases = store.benchmarkDatasets.filter((c) => (c.owner_id || 0) === ownerId);
  if (!domain || domain === "all") {
    return [...userCases];
  }
  const normalizedDomain = domain.trim().toLowerCase();
  return userCases.filter((c) => (c.domain || "general").toLowerCase() === normalizedDomain);
}

export function addObservabilityLog(ownerId: number, entry: Omit<ProviderObservabilityLog, "log_id" | "owner_id" | "created_at">): ProviderObservabilityLog {
  const store = getStore();
  const created: ProviderObservabilityLog = {
    log_id: store.nextLogId++,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
    ...entry,
  };
  store.observabilityLogs.push(created);
  // Keep logs bounded.
  if (store.observabilityLogs.length > 5000) {
    store.observabilityLogs = store.observabilityLogs.slice(-5000);
  }
  persistStore();
  return created;
}

export function listObservabilityLogs(ownerId: number, provider?: string): ProviderObservabilityLog[] {
  return getStore().observabilityLogs
    .filter((log) => log.owner_id === ownerId)
    .filter((log) => !provider || log.provider.toLowerCase() === provider.toLowerCase())
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

export function getUserAnalysisThreshold(ownerId: number): number {
  const store = getStore();
  const found = store.userAnalysisThresholds.find((item) => item.owner_id === ownerId);
  if (!found) return 0.72;
  return Math.max(0.35, Math.min(0.95, found.threshold));
}

export function getUserAnalysisThresholdInfo(ownerId: number): {
  threshold: number;
  source: "default" | "calibrated";
  updated_at?: string;
} {
  const store = getStore();
  const found = store.userAnalysisThresholds.find((item) => item.owner_id === ownerId);
  if (!found) {
    return { threshold: 0.72, source: "default" };
  }
  return {
    threshold: Math.max(0.35, Math.min(0.95, found.threshold)),
    source: "calibrated",
    updated_at: found.updated_at,
  };
}

export function setUserAnalysisThreshold(ownerId: number, threshold: number): number {
  const store = getStore();
  const normalized = Math.max(0.35, Math.min(0.95, threshold));
  const idx = store.userAnalysisThresholds.findIndex((item) => item.owner_id === ownerId);
  const next = { owner_id: ownerId, threshold: normalized, updated_at: new Date().toISOString() };
  if (idx >= 0) {
    store.userAnalysisThresholds[idx] = next;
  } else {
    store.userAnalysisThresholds.push(next);
  }
  persistStore();
  return normalized;
}

export function getPublishedMockSources(): CandidateSource[] {
  return [...MOCK_PUBLISHED_SOURCES];
}

export function rankCandidateMatches(sourceText: string, candidates: CandidateSource[]): {
  bestText: string;
  maxSimilarity: number;
  matches: Array<{
    platform: string;
    title: string;
    url: string;
    matched_percentage: number;
  }>;
} {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      matched_percentage: Number((calcOverallSimilarity(sourceText, candidate.text) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.matched_percentage - a.matched_percentage);

  if (!ranked.length) {
    return { bestText: "", maxSimilarity: 0, matches: [] };
  }

  return {
    bestText: ranked[0].candidate.text,
    maxSimilarity: ranked[0].matched_percentage,
    matches: ranked.slice(0, 6).map((r) => ({
      platform: r.candidate.platform,
      title: r.candidate.title,
      url: r.candidate.url,
      matched_percentage: r.matched_percentage,
    })),
  };
}

function normalizeSourcePayloadText(text: string): string {
  const cleaned = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isLikelyExtractionNoise(line));

  return cleaned.join(" ").replace(/\s+/g, " ").trim();
}

function sourceChecksum(text: string): string {
  return createHash("sha256").update(normalizeSourcePayloadText(text).toLowerCase()).digest("hex");
}

function createSourceChunks(store: InMemoryStore, sourceId: number, ownerId: number, text: string): SourceChunk[] {
  const sentences = sentenceSplit(text);
  const chunks: SourceChunk[] = [];

  if (!sentences.length) {
    const fallback = text.slice(0, 1200).trim();
    if (!fallback) return chunks;

    chunks.push({
      chunk_id: store.nextChunkId++,
      source_id: sourceId,
      owner_id: ownerId,
      text: fallback,
      tokens: tokenize(fallback),
      created_at: new Date().toISOString(),
    });
    return chunks;
  }

  const windowSize = 3;
  const step = 2;
  for (let i = 0; i < sentences.length; i += step) {
    const textChunk = sentences.slice(i, i + windowSize).join(" ").trim();
    if (!textChunk || textChunk.length < 40) continue;

    chunks.push({
      chunk_id: store.nextChunkId++,
      source_id: sourceId,
      owner_id: ownerId,
      text: textChunk,
      tokens: tokenize(textChunk),
      created_at: new Date().toISOString(),
    });
  }

  return chunks;
}

export function ingestIndexedSource(
  ownerId: number,
  source: { platform: string; title: string; url?: string; text: string },
): IndexedSource {
  const store = getStore();
  const normalizedText = normalizeSourcePayloadText(source.text);
  const checksum = sourceChecksum(normalizedText);
  const now = new Date().toISOString();

  const existing = store.indexedSources.find(
    (item) => item.owner_id === ownerId && item.checksum === checksum,
  );

  if (existing) {
    return existing;
  }

  const created: IndexedSource = {
    source_id: store.nextSourceId++,
    owner_id: ownerId,
    platform: source.platform.trim() || "Internal Source",
    title: source.title.trim() || "Untitled Source",
    url: (source.url || "").trim(),
    text: normalizedText,
    checksum,
    created_at: now,
    updated_at: now,
  };

  store.indexedSources.push(created);

  const newChunks = createSourceChunks(store, created.source_id, ownerId, normalizedText);
  store.sourceChunks.push(...newChunks);
  persistStore();

  return created;
}

export function listIndexedSources(ownerId: number, platform?: string): IndexedSource[] {
  return getStore().indexedSources
    .filter((source) => source.owner_id === ownerId)
    .filter((source) => !platform || platform === "All" || source.platform.toLowerCase() === platform.toLowerCase())
    .sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1));
}

export function getIndexedSourceCandidates(ownerId: number): CandidateSource[] {
  return listIndexedSources(ownerId).map((item) => ({
    source_id: item.source_id,
    platform: item.platform,
    title: item.title,
    url: item.url,
    text: item.text,
  }));
}

export function rankIndexedSourceEvidence(
  sourceText: string,
  ownerId: number,
  limit = 6,
): SourceEvidenceMatch[] {
  const store = getStore();
  const indexed = listIndexedSources(ownerId);
  const sourceSentences = sampleArray(sentenceSplit(sourceText), 80);

  const ranked = indexed.map((item) => {
    const chunks = store.sourceChunks.filter((chunk) => chunk.owner_id === ownerId && chunk.source_id === item.source_id);
    const sentenceEvidence: SourceMatchEvidence[] = [];

    sourceSentences.forEach((srcSentence, sentenceIndex) => {
      let bestChunk: SourceChunk | null = null;
      let bestScore = 0;

      for (const chunk of chunks) {
        const score = pairScore(srcSentence, chunk.text);
        if (score > bestScore) {
          bestScore = score;
          bestChunk = chunk;
        }
      }

      if (bestChunk && bestScore >= 0.6) {
        sentenceEvidence.push({
          source_sentence: srcSentence,
          matched_chunk: bestChunk.text,
          score: Number(bestScore.toFixed(4)),
          source_sentence_index: sentenceIndex,
          chunk_id: bestChunk.chunk_id,
        });
      }
    });

    const matchedPercentage = Number((calcOverallSimilarity(sourceText, item.text) * 100).toFixed(2));

    return {
      source_id: item.source_id,
      platform: item.platform,
      title: item.title,
      url: item.url,
      matched_percentage: matchedPercentage,
      matched_sentences: sentenceEvidence
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    };
  })
    .filter((item) => item.matched_percentage > 0)
    .sort((a, b) => b.matched_percentage - a.matched_percentage);

  return ranked.slice(0, limit);
}

export function computeReport(
  sourceText: string,
  comparisonText: string,
  reportId: number,
  ownerId: number,
  compareAgainst: string[] = [],
  metadata?: {
    publishedMaxSimilarity?: number;
    publishedStatus?: string;
    publishedMessage?: string;
    sourceEvidenceMatches?: SourceEvidenceMatch[];
    audit?: ReportAuditMetadata;
    expiresAt?: string;
    threshold?: number;
  },
): Report {
  const sourceSentences = sentenceSplit(sourceText);
  const targetSentences = sentenceSplit(comparisonText);
  const threshold = Math.max(0.35, Math.min(0.95, metadata?.threshold ?? 0.72));
  const copyPasteThreshold = 0.9;

  // Sample sentences to cap worst-case O(N×M) computation for large inputs.
  const matrixSrc = sampleArray(sourceSentences, 100);
  const matrixTgt = sampleArray(targetSentences, 100);

  const similarity_matrix = matrixSrc.map((src) =>
    matrixTgt.map((tgt) => Number(pairScore(src, tgt).toFixed(4))),
  );

  const direct_copy_pairs: SentencePair[] = [];
  const ai_sentence_signals: AiSentenceSignal[] = [];

  const sentence_pairs: SentencePair[] = matrixSrc.map((src, idx) => {
    const row = similarity_matrix[idx] || [];
    let bestIdx = 0;
    let best = 0;
    row.forEach((v, i) => {
      if (v > best) {
        best = v;
        bestIdx = i;
      }
    });
    const bestTarget = matrixTgt[bestIdx] || "";
    const ngramOverlap = ngramJaccard(src, bestTarget, 4);
    const isDirectCopy = best >= copyPasteThreshold || ngramOverlap >= 0.9;

    if (isDirectCopy) {
      direct_copy_pairs.push({
        source_sentence: src,
        target_sentence: bestTarget,
        score: Number(best.toFixed(4)),
        flagged: true,
      });
    }

    if (best >= 0.62 && best < copyPasteThreshold && ngramOverlap < 0.55) {
      ai_sentence_signals.push({
        source_sentence: src,
        target_sentence: bestTarget,
        score: Number(best.toFixed(4)),
        ngram_overlap: Number(ngramOverlap.toFixed(4)),
        label: "ai_humanized_likely",
      });
    }

    return {
      source_sentence: src,
      target_sentence: bestTarget,
      score: Number(best.toFixed(4)),
      flagged: best >= threshold,
    };
  });

  const flagged_pairs = sentence_pairs.filter((p) => p.flagged).length;
  const total_pairs = sentence_pairs.length;
  const mean = total_pairs ? sentence_pairs.reduce((acc, p) => acc + p.score, 0) / total_pairs : 0;
  const plagiarism = total_pairs ? (flagged_pairs / total_pairs) * 100 : 0;
  const directCopyCount = direct_copy_pairs.length;
  const directCopyPercentage = total_pairs ? (directCopyCount / total_pairs) * 100 : 0;
  const tfidf = Math.max(0, Math.min(100, mean * 80));
  const aiRewriteLikelihood = Math.max(0, Math.min(100, (mean * 100) - tfidf));

  const entropy = tokenEntropy(sourceText);
  const perplexity = perplexityProxy(sourceText);
  const burstiness = sentenceBurstiness(sourceText);
  const sourceTokens = tokenize(sourceText);
  const tokenCount = sourceTokens.length;
  const uniqueTokenCount = new Set(sourceTokens).size;
  const ttr = tokenCount ? uniqueTokenCount / tokenCount : 0;

  const lengthVariance = sentenceLengthVariance(sourceSentences);
  const uniformityBoost = Math.max(0, Math.min(25, 25 - (lengthVariance * 1.5)));
  const lowBurstinessSignal = Math.max(0, Math.min(25, 25 - (burstiness * 100)));
  const lowEntropySignal = Math.max(0, Math.min(20, 20 - (entropy * 2.2)));
  const aiInvolvement = Math.max(
    0,
    Math.min(100, (aiRewriteLikelihood * 0.45) + uniformityBoost + lowBurstinessSignal + lowEntropySignal + (plagiarism * 0.12)),
  );
  const humanWritten = Math.max(0, 100 - aiInvolvement);
  const humanizedByAi = aiInvolvement >= 45 && plagiarism >= 20 && directCopyPercentage <= 25;
  const humanizedReason = humanizedByAi
    ? "High semantic overlap with low direct-copy ratio suggests AI-assisted humanized rewriting."
    : "No strong AI-humanized rewriting signal detected.";

  const multiMax = compareAgainst.reduce((max, candidate) => {
    const score = calcOverallSimilarity(sourceText, candidate) * 100;
    return Math.max(max, score);
  }, 0);

  const evidenceMatches = metadata?.sourceEvidenceMatches || [];
  const topEvidenceScore = evidenceMatches.length ? evidenceMatches[0].matched_percentage : 0;

  return {
    report_id: reportId,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
    expires_at: metadata?.expiresAt,
    summary: {
      overall_similarity: Number((mean * 100).toFixed(2)),
      plagiarism_score: Number(plagiarism.toFixed(2)),
      direct_copy_percentage: Number(directCopyPercentage.toFixed(2)),
      flagged_pairs,
      total_pairs,
      tfidf_similarity: Number(tfidf.toFixed(2)),
      threshold,
      multiple_document_max_similarity: Number(multiMax.toFixed(2)),
      ai_rewrite_likelihood: Number(aiRewriteLikelihood.toFixed(2)),
      ai_involvement_percentage: Number(aiInvolvement.toFixed(2)),
      human_written_percentage: Number(humanWritten.toFixed(2)),
      perplexity_proxy: Number(perplexity.toFixed(3)),
      token_entropy: Number(entropy.toFixed(3)),
      sentence_burstiness: Number(burstiness.toFixed(3)),
      type_token_ratio: Number(ttr.toFixed(3)),
      humanized_by_ai_detected: humanizedByAi,
      humanized_reason: humanizedReason,
      published_check_status: metadata?.publishedStatus ?? "mock",
      published_check_message: metadata?.publishedMessage ?? "Published source check is unavailable in local mock mode.",
      published_max_similarity: Number((metadata?.publishedMaxSimilarity ?? topEvidenceScore).toFixed(2)),
    },
    sentence_pairs,
    direct_copy_pairs,
    ai_sentence_signals: ai_sentence_signals.slice(0, 12),
    source_evidence_matches: evidenceMatches,
    audit: metadata?.audit || buildReportAuditMetadata({
      ownerId,
      sourceText,
      comparisonText,
      indexedSourcesConsidered: 0,
      providersUsed: ["unknown"],
    }),
    similarity_matrix,
    source_text: sourceText,
    comparison_text: comparisonText,
  };
}
