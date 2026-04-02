"use client";

import dynamic from "next/dynamic";

const Plot: any = dynamic(() => import("react-plotly.js"), { ssr: false });

type AiShareChartProps = {
  aiPercentage: number;
  humanPercentage: number;
};

export default function AiShareChart({ aiPercentage, humanPercentage }: AiShareChartProps) {
  return (
    <Plot
      data={[
        {
          values: [Math.max(0, aiPercentage), Math.max(0, humanPercentage)],
          labels: ["AI-generated", "Human-written"],
          type: "pie",
          marker: { colors: ["#D62828", "#005F73"] },
          textinfo: "label+percent",
          hole: 0.42,
        },
      ]}
      layout={{
        autosize: true,
        margin: { l: 10, r: 10, b: 10, t: 10 },
        showlegend: false,
        paper_bgcolor: "rgba(0,0,0,0)",
      }}
      style={{ width: "100%", height: "300px" }}
      config={{ responsive: true, displaylogo: false }}
    />
  );
}
