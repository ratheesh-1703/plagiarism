import type { Metadata } from "next";
import { Space_Grotesk, Merriweather } from "next/font/google";

import "./globals.css";

const heading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const body = Merriweather({ subsets: ["latin"], variable: "--font-body", weight: ["300", "400", "700"] });

export const metadata: Metadata = {
  title: "Semantic Plagiarism Detector",
  description: "Plagiarism detection with SBERT semantic similarity",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body style={{ fontFamily: "var(--font-body)" }}>{children}</body>
    </html>
  );
}
