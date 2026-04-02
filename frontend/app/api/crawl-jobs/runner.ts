import {
  getStore,
  updateCrawlJob,
  type CrawlJob,
} from "../_store";
import { discoverAndIngestSources, type DiscoveryProvider } from "../sources/discovery";

export async function processCrawlJob(ownerId: number, crawlJobId: number): Promise<CrawlJob | null> {
  const store = getStore();
  const job = store.crawlJobs.find((entry) => entry.crawl_job_id === crawlJobId && entry.owner_id === ownerId);
  if (!job) return null;

  updateCrawlJob(crawlJobId, {
    status: "running",
    started_at: new Date().toISOString(),
    error: undefined,
  });

  try {
    const result = await discoverAndIngestSources({
      ownerId,
      query: job.query,
      maxResults: job.max_results,
      providers: job.providers_requested as DiscoveryProvider[],
    });

    return updateCrawlJob(crawlJobId, {
      status: "completed",
      processed: result.discovered,
      ingested: result.ingested,
      duplicates: result.duplicates,
      providers_used: result.providersUsed,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    return updateCrawlJob(crawlJobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown crawl failure",
      completed_at: new Date().toISOString(),
    });
  }
}
