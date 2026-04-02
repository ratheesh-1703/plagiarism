import { NextRequest, NextResponse } from "next/server";

import { enforceReportRetention, getStore, getUserIdFromAuthHeader } from "../../../_store";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  enforceReportRetention(userId);

  const reportId = Number(context.params.id);
  const store = getStore();
  const report = store.reports.find((r) => r.report_id === reportId && r.owner_id === userId);
  if (!report) {
    return NextResponse.json({ detail: "Report not found" }, { status: 404 });
  }

  const lines = [
    `# Report ${report.report_id}`,
    `Generated: ${report.created_at}`,
    `Expires: ${report.expires_at || "not-set"}`,
    "",
    `Overall similarity: ${report.summary.overall_similarity}%`,
    `Plagiarism score: ${report.summary.plagiarism_score}%`,
    "",
    "## Audit Metadata",
    `Created by user: ${report.audit?.created_by_user_id ?? "n/a"}`,
    `Source checksum: ${report.audit?.source_text_checksum ?? "n/a"}`,
    `Comparison checksum: ${report.audit?.comparison_text_checksum ?? "n/a"}`,
    `Indexed sources considered: ${report.audit?.indexed_sources_considered ?? 0}`,
    `Providers used: ${(report.audit?.providers_used || ["n/a"]).join(", ")}`,
    `Version: ${report.audit?.benchmarkable_version ?? "legacy"}`,
    `Generated at: ${report.audit?.generated_at ?? report.created_at}`,
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename=report_${report.report_id}.md`,
    },
  });
}
