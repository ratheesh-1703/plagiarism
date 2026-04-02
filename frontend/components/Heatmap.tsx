"use client";

import dynamic from "next/dynamic";

const Plot: any = dynamic(() => import("react-plotly.js"), { ssr: false });

type HeatmapProps = {
  z: number[][];
};

export default function Heatmap({ z }: HeatmapProps) {
  return (
    <Plot
      data={[
        {
          z,
          type: "heatmap",
          colorscale: "YlOrRd",
          hoverongaps: false,
        },
      ]}
      layout={{
        autosize: true,
        margin: { l: 30, r: 20, b: 40, t: 20 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
      }}
      style={{ width: "100%", height: "340px" }}
      config={{ responsive: true, displaylogo: false }}
    />
  );
}
