import { addObservabilityLog, ingestIndexedSource, type IndexedSource } from "../_store";

export type DiscoveryProvider = "openalex" | "crossref" | "wikipedia" | "ieee" | "elsevier";

export type DiscoveryCandidate = {
  platform: string;
  title: string;
  url: string;
  text: string;
};

export type DiscoveryRunResult = {
  providersUsed: DiscoveryProvider[];
  discovered: number;
  ingested: number;
  duplicates: number;
  items: IndexedSource[];
};

type ProviderPolicy = {
  minIntervalMs: number;
  retries: number;
  backoffMs: number;
  timeoutMs: number;
};

const LAST_REQUEST_AT = new Map<DiscoveryProvider, number>();

const PROVIDER_POLICY: Record<DiscoveryProvider, ProviderPolicy> = {
  openalex: { minIntervalMs: 300, retries: 2, backoffMs: 400, timeoutMs: 12000 },
  crossref: { minIntervalMs: 350, retries: 2, backoffMs: 500, timeoutMs: 12000 },
  wikipedia: { minIntervalMs: 250, retries: 2, backoffMs: 300, timeoutMs: 10000 },
  ieee: { minIntervalMs: 800, retries: 3, backoffMs: 900, timeoutMs: 15000 },
  elsevier: { minIntervalMs: 900, retries: 3, backoffMs: 1000, timeoutMs: 15000 },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithProviderPolicy(
  ownerId: number,
  provider: DiscoveryProvider,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const policy = PROVIDER_POLICY[provider];
  const endpoint = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  const last = LAST_REQUEST_AT.get(provider) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < policy.minIntervalMs) {
    const waitMs = policy.minIntervalMs - elapsed;
    addObservabilityLog(ownerId, {
      provider,
      endpoint,
      status: "throttled",
      attempt: 0,
      duration_ms: waitMs,
      message: `rate-limited before request by ${waitMs}ms`,
    });
    await delay(waitMs);
  }

  for (let attempt = 1; attempt <= policy.retries + 1; attempt += 1) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      LAST_REQUEST_AT.set(provider, Date.now());
      const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
      clearTimeout(timeout);
      const duration = Date.now() - start;
      if (response.ok) {
        addObservabilityLog(ownerId, {
          provider,
          endpoint,
          status: "success",
          attempt,
          http_status: response.status,
          duration_ms: duration,
          message: "provider request succeeded",
        });
        return response;
      }

      const retryable = response.status === 429 || response.status >= 500;
      addObservabilityLog(ownerId, {
        provider,
        endpoint,
        status: retryable && attempt <= policy.retries ? "retry" : "failure",
        attempt,
        http_status: response.status,
        duration_ms: duration,
        message: retryable ? "retryable provider error" : "non-retryable provider error",
      });

      if (!retryable || attempt > policy.retries) {
        return response;
      }

      await delay(policy.backoffMs * attempt);
    } catch (error) {
      clearTimeout(timeout);
      const duration = Date.now() - start;
      const isLast = attempt > policy.retries;
      addObservabilityLog(ownerId, {
        provider,
        endpoint,
        status: isLast ? "failure" : "retry",
        attempt,
        duration_ms: duration,
        message: error instanceof Error ? error.message : "provider request failed",
      });
      if (isLast) {
        throw error;
      }
      await delay(policy.backoffMs * attempt);
    }
  }

  throw new Error(`Provider ${provider} request failed after retries`);
}

function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeOpenAlexAbstract(index?: Record<string, number[]>): string {
  if (!index || typeof index !== "object") return "";

  const positioned: Array<{ pos: number; token: string }> = [];
  Object.entries(index).forEach(([token, positions]) => {
    positions.forEach((pos) => positioned.push({ pos, token }));
  });
  positioned.sort((a, b) => a.pos - b.pos);
  return positioned.map((entry) => entry.token).join(" ");
}

async function fetchOpenAlex(ownerId: number, query: string, limit: number): Promise<DiscoveryCandidate[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${Math.min(limit, 25)}`;
  const res = await fetchWithProviderPolicy(ownerId, "openalex", url);
  if (!res.ok) return [];

  const json = await res.json().catch(() => null) as { results?: Array<Record<string, unknown>> } | null;
  if (!json?.results) return [];

  return json.results
    .map((item) => {
      const title = String(item.display_name || "Untitled OpenAlex Work");
      const sourceUrl = String(item.id || "");
      const abstract = decodeOpenAlexAbstract(item.abstract_inverted_index as Record<string, number[]> | undefined);
      const text = sanitizeText(`${title}. ${abstract}`);
      return { platform: "OpenAlex", title, url: sourceUrl, text };
    })
    .filter((entry) => entry.text.length >= 80);
}

async function fetchCrossref(ownerId: number, query: string, limit: number): Promise<DiscoveryCandidate[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.min(limit, 25)}`;
  const res = await fetchWithProviderPolicy(ownerId, "crossref", url);
  if (!res.ok) return [];

  const json = await res.json().catch(() => null) as { message?: { items?: Array<Record<string, unknown>> } } | null;
  const items = json?.message?.items || [];

  return items
    .map((item) => {
      const title = Array.isArray(item.title) ? String(item.title[0] || "Untitled Crossref Work") : "Untitled Crossref Work";
      const doi = typeof item.DOI === "string" ? item.DOI : "";
      const abstract = typeof item.abstract === "string" ? item.abstract : "";
      const text = sanitizeText(`${title}. ${abstract}`);
      return { platform: "Crossref", title, url: doi ? `https://doi.org/${doi}` : "", text };
    })
    .filter((entry) => entry.text.length >= 80);
}

async function fetchWikipedia(ownerId: number, query: string, limit: number): Promise<DiscoveryCandidate[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&srlimit=${Math.min(limit, 15)}`;
  const res = await fetchWithProviderPolicy(ownerId, "wikipedia", url);
  if (!res.ok) return [];

  const json = await res.json().catch(() => null) as {
    query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> };
  } | null;

  return (json?.query?.search || [])
    .map((entry) => {
      const title = entry.title || "Wikipedia Entry";
      const text = sanitizeText(`${title}. ${entry.snippet || ""}`);
      return {
        platform: "Wikipedia",
        title,
        url: entry.pageid ? `https://en.wikipedia.org/?curid=${entry.pageid}` : "",
        text,
      };
    })
    .filter((entry) => entry.text.length >= 80);
}

// Optional licensed API connector (requires IEEE_XPLORE_API_KEY).
async function fetchIeeeXplore(ownerId: number, query: string, limit: number): Promise<DiscoveryCandidate[]> {
  const key = process.env.IEEE_XPLORE_API_KEY;
  if (!key) return [];

  const url = `https://ieeexploreapi.ieee.org/api/v1/search/articles?apikey=${encodeURIComponent(key)}&format=json&max_records=${Math.min(limit, 25)}&start_record=1&querytext=${encodeURIComponent(query)}`;
  const res = await fetchWithProviderPolicy(ownerId, "ieee", url);
  if (!res.ok) return [];

  const json = await res.json().catch(() => null) as { articles?: Array<Record<string, unknown>> } | null;
  const articles = json?.articles || [];

  return articles
    .map((article) => {
      const title = String(article.title || "Untitled IEEE Article");
      const abstract = typeof article.abstract === "string" ? article.abstract : "";
      const doi = typeof article.doi === "string" ? article.doi : "";
      const text = sanitizeText(`${title}. ${abstract}`);
      return { platform: "IEEE", title, url: doi ? `https://doi.org/${doi}` : "", text };
    })
    .filter((entry) => entry.text.length >= 80);
}

// Optional licensed API connector (requires ELSEVIER_API_KEY).
async function fetchElsevierScopus(ownerId: number, query: string, limit: number): Promise<DiscoveryCandidate[]> {
  const key = process.env.ELSEVIER_API_KEY;
  if (!key) return [];

  const url = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(query)}&count=${Math.min(limit, 25)}&apiKey=${encodeURIComponent(key)}`;
  const res = await fetchWithProviderPolicy(ownerId, "elsevier", url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];

  const json = await res.json().catch(() => null) as {
    "search-results"?: { entry?: Array<Record<string, unknown>> };
  } | null;
  const entries = json?.["search-results"]?.entry || [];

  return entries
    .map((entry) => {
      const title = String(entry["dc:title"] || "Untitled Elsevier Record");
      const description = String(entry["dc:description"] || "");
      const identifier = String(entry["prism:doi"] || "");
      const text = sanitizeText(`${title}. ${description}`);
      return {
        platform: "Elsevier/Scopus",
        title,
        url: identifier ? `https://doi.org/${identifier}` : "",
        text,
      };
    })
    .filter((entry) => entry.text.length >= 80);
}

export async function discoverAndIngestSources(input: {
  ownerId: number;
  query: string;
  maxResults: number;
  providers?: DiscoveryProvider[];
}): Promise<DiscoveryRunResult> {
  const perProvider = Math.max(3, Math.ceil(input.maxResults / 3));
  const requested = input.providers?.length
    ? input.providers
    : ["openalex", "crossref", "wikipedia", "ieee", "elsevier"];

  const resultsByProvider = await Promise.all(requested.map(async (provider) => {
    try {
      if (provider === "openalex") return { provider, items: await fetchOpenAlex(input.ownerId, input.query, perProvider) };
      if (provider === "crossref") return { provider, items: await fetchCrossref(input.ownerId, input.query, perProvider) };
      if (provider === "wikipedia") return { provider, items: await fetchWikipedia(input.ownerId, input.query, perProvider) };
      if (provider === "ieee") return { provider, items: await fetchIeeeXplore(input.ownerId, input.query, perProvider) };
      if (provider === "elsevier") return { provider, items: await fetchElsevierScopus(input.ownerId, input.query, perProvider) };
      return { provider, items: [] as DiscoveryCandidate[] };
    } catch {
      return { provider, items: [] as DiscoveryCandidate[] };
    }
  }));

  const providersUsed = resultsByProvider
    .filter((entry) => entry.items.length > 0)
    .map((entry) => entry.provider as DiscoveryProvider);

  const combined = resultsByProvider.flatMap((entry) => entry.items).slice(0, input.maxResults);

  let duplicates = 0;
  const ingested: IndexedSource[] = [];
  for (const candidate of combined) {
    const created = ingestIndexedSource(input.ownerId, candidate);
    if (ingested.some((item) => item.source_id === created.source_id)) {
      duplicates += 1;
      continue;
    }
    ingested.push(created);
  }

  return {
    providersUsed,
    discovered: combined.length,
    ingested: ingested.length,
    duplicates,
    items: ingested,
  };
}
