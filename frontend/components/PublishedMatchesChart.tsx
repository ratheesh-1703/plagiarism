"use client";

import dynamic from "next/dynamic";

const Plot: any = dynamic(() => import("react-plotly.js"), { ssr: false });

type PublishedMatch = {
  platform: string;
  title: string;
  matched_percentage: number;
};

type PublishedMatchesChartProps = {
  matches: PublishedMatch[];
};

export default function PublishedMatchesChart({ matches }: PublishedMatchesChartProps) {
  const top = matches.slice(0, 6);
  const labels = top.map((m) => `${m.platform}: ${m.title.slice(0, 28)}${m.title.length > 28 ? "..." : ""}`);
  const values = top.map((m) => m.matched_percentage);

  return (
    <Plot
      data={[
        {
          x: values,
          y: labels,
          type: "bar",
          orientation: "h",
          marker: { color: "#005F73" },
        },
      ]}
      layout={{
        autosize: true,
        margin: { l: 220, r: 20, b: 30, t: 10 },
        xaxis: { title: "Matched %", range: [0, 100] },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
      }}
      style={{ width: "100%", height: "320px" }}
      config={{ responsive: true, displaylogo: false }}
    />
  );
}
