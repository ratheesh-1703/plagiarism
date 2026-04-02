import { NextRequest, NextResponse } from "next/server";

import { getStore, getUserIdFromAuthHeader, listBenchmarkRuns, listIndexedSources } from "../../_store";

type GenerateBody = {
  topic?: unknown;
  customPrompt?: unknown;
  deploymentContext?: unknown;
};

function paragraph(lines: string[]): string {
  return lines.join(" ");
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as GenerateBody;
  const topic = typeof body.topic === "string" && body.topic.trim()
    ? body.topic.trim()
    : "Adaptive Integrity-Aware Knowledge Systems";
  const deploymentContext = typeof body.deploymentContext === "string" && body.deploymentContext.trim()
    ? body.deploymentContext.trim()
    : "higher-education and research innovation labs";
  const customPrompt = typeof body.customPrompt === "string" ? body.customPrompt.trim() : "";

  const indexedSources = listIndexedSources(userId).slice(0, 8);
  const benchmarkRuns = listBenchmarkRuns(userId).slice(0, 5);
  const store = getStore();
  const reportCount = store.reports.filter((r) => r.owner_id === userId).length;

  const avgPrecision = benchmarkRuns.length
    ? benchmarkRuns.reduce((acc, run) => acc + run.precision, 0) / benchmarkRuns.length
    : 0;
  const avgRecall = benchmarkRuns.length
    ? benchmarkRuns.reduce((acc, run) => acc + run.recall, 0) / benchmarkRuns.length
    : 0;

  const sourceLens = indexedSources.length
    ? indexedSources.map((s) => `${s.platform}::${s.title}`).slice(0, 4).join("; ")
    : "No indexed references yet; the design therefore includes a staged evidence onboarding path.";

  const sections = {
    project_title: `${topic}: A Research-Driven Architecture for Explainable, Adaptive Academic Intelligence`,
    abstract: paragraph([
      `This project proposes a research-grade system architecture for ${topic.toLowerCase()}, designed for ${deploymentContext}.`,
      "Instead of treating analytical outputs as static scores, the system treats each result as an evidence-bearing, auditable research artifact.",
      `The prototype combines indexed evidence retrieval, benchmark instrumentation, and lifecycle governance, enabling continuous model scrutiny rather than one-off evaluation.`,
      `Initial context synthesis used ${indexedSources.length} indexed sources and ${benchmarkRuns.length} benchmark runs to shape design assumptions and validation boundaries.`,
    ]),
    introduction: paragraph([
      "Contemporary advanced systems often over-optimize for raw prediction strength while under-investing in interpretability and operational traceability.",
      `In ${deploymentContext}, this imbalance creates a trust gap: stakeholders may receive technically plausible outputs without clear methodological accountability.`,
      `This project reframes system intelligence as a chain of accountable decisions where evidence provenance, benchmark behavior, and retention policy are first-class design primitives.`,
    ]),
    problem_statement: paragraph([
      "The core challenge is not only producing high-quality automated analysis, but preserving epistemic confidence in how outputs were produced.",
      "Most prototype systems fail under three pressures: heterogeneous sources, changing domains, and governance constraints that emerge after deployment.",
      "A system that cannot narrate its own reasoning trajectory cannot support serious research claims, even when its top-line metrics appear competitive.",
    ]),
    objectives: paragraph([
      "The first objective is to formalize evidence-grounded generation so every analytical narrative can be traced to explicit source context.",
      "The second objective is to operationalize continuous benchmarking with per-domain diagnostics to prevent hidden regressions.",
      "The third objective is to embed security, retention, and observability controls directly into the architecture rather than as post-hoc patches.",
    ]),
    literature_insight: paragraph([
      "Three lessons emerge from practice-driven literature trajectories: accuracy without calibration is fragile, explainability without operational telemetry is performative, and governance without automation is unsustainable.",
      "Accordingly, this design aligns model behavior with evidence indexing, runtime telemetry, and policy-bound data lifecycle controls.",
      `Current source lens for this repository indicates: ${sourceLens}`,
    ]),
    system_architecture_and_design: paragraph([
      "The architecture is organized into five planes: ingestion, indexed retrieval, analytical synthesis, benchmark governance, and policy enforcement.",
      "The ingestion plane converts heterogeneous artifacts into normalized semantic units; the retrieval plane constructs chunk-level evidence candidates.",
      "The synthesis plane composes reasoning narratives from scored evidence, while governance planes continuously evaluate quality and enforce lifecycle boundaries.",
    ]),
    algorithms_ai_techniques_used: paragraph([
      "The analytical core fuses token-overlap statistics, cosine-style lexical vectors, and n-gram structural alignment into weighted sentence-level scoring.",
      "A domain-aware benchmark loop computes precision-recall behavior over curated cases, enabling threshold adaptation by context instead of global heuristics.",
      "Research extensions include confidence-aware re-ranking and contradiction-sensitive evidence filtering to reduce persuasive but weakly grounded narratives.",
    ]),
    implementation_methodology: paragraph([
      "Implementation follows an incremental validation method: establish deterministic baseline metrics, introduce controlled architectural variation, and capture telemetry before/after each change.",
      "Every release artifact is coupled with benchmark deltas and observability summaries so architecture decisions remain empirically auditable.",
      `In this workspace, ${reportCount} reports already provide empirical traces that can be mined for scenario-specific regression tests.`,
    ]),
    innovative_features: paragraph([
      "A distinguishing feature is evidence-first narrative assembly, where prose sections are generated with explicit methodological anchors rather than free-form abstraction.",
      "Another novelty is policy-coupled intelligence: retention windows, observability logs, and benchmark lineage are handled as co-equal system outputs.",
      "This turns the platform from a result emitter into a research instrument that can be interrogated, replicated, and challenged.",
    ]),
    system_workflow: paragraph([
      "Workflow begins with source ingestion and chunk normalization, proceeds through candidate retrieval and comparative scoring, then culminates in an evidence-linked narrative report.",
      "A parallel governance loop runs benchmark probes and provider telemetry checks, feeding threshold and reliability insights back into the synthesis layer.",
      "The result is a closed-loop analytical system where operational behavior continuously informs methodological calibration.",
    ]),
    real_world_application: paragraph([
      `In ${deploymentContext}, this design supports research offices, academic quality units, and hackathon teams that need both innovation velocity and reviewable rigor.`,
      "For example, a university innovation center can pilot domain-specific analytical modules while preserving an auditable trajectory of evidence, model behavior, and policy compliance.",
      "This allows stakeholders to separate genuine methodological improvement from metric inflation.",
    ]),
    security_and_performance_considerations: paragraph([
      "Security is enforced through authenticated API boundaries, least-privilege data access patterns, and bounded retention windows to reduce long-tail exposure.",
      "Performance strategy prioritizes asynchronous crawl scheduling, provider-specific throttling with backoff, and indexed chunk retrieval to minimize end-to-end latency.",
      "Observability logs provide forensic visibility into provider instability, retry storms, and throughput bottlenecks.",
    ]),
    future_enhancements: paragraph([
      "Planned enhancements include adaptive policy engines that alter retention and threshold rules by regulatory context, and richer domain ontologies for evidence typing.",
      "A multi-agent critique layer can be added to challenge generated narratives for unsupported claims before publication.",
      "Longer term, federated benchmark exchange could enable cross-institution validation without exposing sensitive raw datasets.",
    ]),
    conclusion: paragraph([
      `The project demonstrates that ${topic.toLowerCase()} can be engineered as a rigorous research system rather than a black-box automation utility.`,
      "Its main contribution is architectural: it integrates evidence retrieval, benchmark discipline, and governance constraints into one coherent operating model.",
      `This makes the system suitable for research and hackathon presentation contexts that require both novelty and methodological defensibility.`,
    ]),
  };

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    prompt_snapshot: customPrompt,
    context: {
      topic,
      deploymentContext,
      indexed_sources: indexedSources.length,
      benchmark_runs: benchmarkRuns.length,
      average_precision: Number(avgPrecision.toFixed(4)),
      average_recall: Number(avgRecall.toFixed(4)),
    },
    sections,
  });
}
