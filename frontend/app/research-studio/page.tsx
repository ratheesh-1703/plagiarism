"use client";

import { useMemo, useState } from "react";

import Shell from "@/components/Shell";
import { apiRequest, getToken } from "@/lib/api";

type GeneratedSections = {
  project_title: string;
  abstract: string;
  introduction: string;
  problem_statement: string;
  objectives: string;
  literature_insight: string;
  system_architecture_and_design: string;
  algorithms_ai_techniques_used: string;
  implementation_methodology: string;
  innovative_features: string;
  system_workflow: string;
  real_world_application: string;
  security_and_performance_considerations: string;
  future_enhancements: string;
  conclusion: string;
};

type GenerateResponse = {
  generated_at: string;
  sections: GeneratedSections;
};

const DEFAULT_PROMPT = `Act as a senior researcher, software architect, and academic writer with expertise in advanced technology development. Your task is to generate a completely original and highly advanced project that appears to be created through deep research and independent thinking.

Do not reuse common internet explanations or textbook definitions. Instead, synthesize knowledge and construct new explanations using logical reasoning, real-world context, and innovative thinking.

Ensure the writing style is fully humanized with natural sentence variation, academic tone, and critical analysis. Avoid robotic AI patterns, repeated sentence structures, and generic wording. The content should read like a university-level research report written by a human expert.

The project must include innovative concepts, practical implementation ideas, and technically sound explanations. Introduce unique improvements, creative algorithms, or system designs that make the project appear novel and research-driven.`;

export default function ResearchStudioPage() {
  const token = useMemo(() => getToken(), []);
  const [topic, setTopic] = useState("Adaptive Integrity-Aware Knowledge Systems");
  const [deploymentContext, setDeploymentContext] = useState("higher-education and research innovation labs");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<GenerateResponse | null>(null);

  async function handleGenerate() {
    if (!token) {
      setError("Login first to use Research Studio.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const generated = await apiRequest<GenerateResponse>(
        "/research-module/generate",
        {
          method: "POST",
          body: JSON.stringify({
            topic,
            deploymentContext,
            customPrompt: prompt,
          }),
        },
        token,
      );
      setReport(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }

  function section(title: string, text: string) {
    return (
      <article className="rounded-xl border border-slate-200 bg-white/80 p-4">
        <h3 className="mb-2 text-lg font-black">{title}</h3>
        <p className="text-sm leading-7 text-slate-800">{text}</p>
      </article>
    );
  }

  return (
    <Shell>
      <section className="space-y-6">
        <article className="panel p-6">
          <h2 className="mb-3 text-2xl font-black">Research Studio Module</h2>
          <p className="mb-4 text-sm text-slate-700">
            Generates a full research-style project draft using structured academic sections and repository context signals.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Project topic" />
            <input className="input" value={deploymentContext} onChange={(e) => setDeploymentContext(e.target.value)} placeholder="Deployment context" />
            <textarea
              className="input min-h-48 md:col-span-2"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Custom research prompt"
            />
          </div>

          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

          <button className="btn-primary mt-4" disabled={loading} onClick={handleGenerate}>
            {loading ? "Generating..." : "Generate research report"}
          </button>
        </article>

        {report && (
          <section className="space-y-4">
            <p className="text-xs text-slate-600">Generated at: {new Date(report.generated_at).toLocaleString()}</p>
            {section("Project Title", report.sections.project_title)}
            {section("Abstract", report.sections.abstract)}
            {section("Introduction", report.sections.introduction)}
            {section("Problem Statement", report.sections.problem_statement)}
            {section("Objectives", report.sections.objectives)}
            {section("Literature Insight", report.sections.literature_insight)}
            {section("System Architecture and Design", report.sections.system_architecture_and_design)}
            {section("Algorithms / AI Techniques Used", report.sections.algorithms_ai_techniques_used)}
            {section("Implementation Methodology", report.sections.implementation_methodology)}
            {section("Innovative Features", report.sections.innovative_features)}
            {section("System Workflow", report.sections.system_workflow)}
            {section("Real-world Application", report.sections.real_world_application)}
            {section("Security and Performance Considerations", report.sections.security_and_performance_considerations)}
            {section("Future Enhancements", report.sections.future_enhancements)}
            {section("Conclusion", report.sections.conclusion)}
          </section>
        )}
      </section>
    </Shell>
  );
}
