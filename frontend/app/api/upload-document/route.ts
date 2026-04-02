import { NextRequest, NextResponse } from "next/server";

import { getStore, getUserIdFromAuthHeader, persistStore } from "../_store";

type ExtractionResult = {
  text: string;
  usedFallback: boolean;
};

function normalizeReadableText(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHumanLanguageSignal(text: string): boolean {
  const normalized = normalizeReadableText(text);
  if (!normalized) return false;

  const asciiLetters = (normalized.match(/[A-Za-z]/g) || []).length;
  const extendedLetters = (normalized.match(/[À-ÿ]/g) || []).length;
  const words = (normalized.match(/[A-Za-z]{2,}/g) || []).length;
  const sentenceMarks = (normalized.match(/[.!?]/g) || []).length;
  const commonWords = (normalized.match(/\b(the|and|of|to|in|for|with|is|are|that|this|on|by|from|as|an|be|or|at)\b/gi) || []).length;
  const letterRatio = normalized.length ? asciiLetters / normalized.length : 0;
  const extendedRatio = normalized.length ? extendedLetters / normalized.length : 0;

  // Require enough word-like tokens and strong natural-language characteristics.
  return words >= 30 && letterRatio >= 0.3 && extendedRatio <= 0.15 && (commonWords >= 4 || sentenceMarks >= 2);
}

function isClearlyUnreadableText(text: string): boolean {
  const normalized = normalizeReadableText(text);
  if (!normalized) return true;

  const letters = (normalized.match(/[\p{L}]/gu) || []).length;
  const words = (normalized.match(/[\p{L}]{3,}/gu) || []).length;

  const letterRatio = normalized.length ? letters / normalized.length : 0;

  // Keep this conservative: only reject when language signal is very weak.
  return words < 8 || (letterRatio < 0.2 && words < 20);
}


function sanitizeFallbackText(raw: string): string {
  return raw
    .replace(/%PDF-[0-9.]+/gi, " ")
    .replace(/\b(endobj|obj|xref|trailer|startxref|stream|endstream)\b/gi, " ")
    .replace(/\/(Type|Catalog|Pages|Font|Length|Filter|Root|Info)\b/gi, " ")
    .replace(/\b\d+\s+\d+\s+R\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPdfLiteralStrings(raw: string): string {
  const matches = raw.match(/\((?:\\.|[^\\)]){2,}\)/g) || [];
  if (!matches.length) {
    return "";
  }

  const normalized = matches
    .map((token) => token.slice(1, -1))
    .map((token) => token
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, " ")
      .replace(/\\r/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\[0-7]{1,3}/g, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function createStoredDocument(
  userId: number,
  filename: string,
  text: string,
): { document_id: number; owner_id: number; filename: string; text: string } {
  const store = getStore();
  const doc = {
    document_id: store.nextDocId++,
    owner_id: userId,
    filename,
    text,
  };
  store.documents.push(doc);
  persistStore();
  return doc;
}

async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  if (ext === "txt" || file.type === "text/plain") {
    return { text: await file.text(), usedFallback: false };
  }

  if (ext === "pdf") {
    const buffer = await file.arrayBuffer();

    try {
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = pdfParseModule.default;
      const parsed = await pdfParse(Buffer.from(buffer));
      const normalized = normalizeReadableText(parsed.text || "");
      if (normalized.length >= 50 && hasHumanLanguageSignal(normalized) && !isClearlyUnreadableText(normalized)) {
        return { text: normalized, usedFallback: false };
      }
    } catch {
      // Continue to secondary extractor.
    }

    // Secondary extractor for PDFs with font/encoding patterns that pdf-parse misses.
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(buffer);
      const doc = await pdfjs.getDocument({ data }).promise;
      const pageTexts: string[] = [];

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        const tokens = content.items
          .map((item) => {
            if (typeof item !== "object" || item === null || !("str" in item)) {
              return "";
            }
            return String(item.str || "");
          })
          .filter((s) => s.trim().length > 0);
        pageTexts.push(tokens.join(" "));
      }

      const pdfjsText = normalizeReadableText(pageTexts.join(" "));
      if (pdfjsText.length >= 50 && hasHumanLanguageSignal(pdfjsText) && !isClearlyUnreadableText(pdfjsText)) {
        return { text: pdfjsText, usedFallback: false };
      }
    } catch {
      // Continue into fallback strategies.
    }

    // Fall back to heuristic extraction below.
  }

  // Fallback extraction for PDF/DOCX in mock mode: keep printable text blocks only.
  return file.arrayBuffer().then((buffer) => {
    const raw = Buffer.from(buffer).toString("latin1");
    const literalText = extractPdfLiteralStrings(raw);
    if (ext === "pdf") {
      const cleanedLiteral = normalizeReadableText(literalText);
      if (cleanedLiteral.length >= 120 && hasHumanLanguageSignal(cleanedLiteral) && !isClearlyUnreadableText(cleanedLiteral)) {
        return { text: cleanedLiteral, usedFallback: true };
      }
    }

    const printable = raw
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s+/g, " ");
    const cleaned = sanitizeFallbackText(printable);
    return { text: normalizeReadableText(cleaned), usedFallback: true };
  });
}

function isLikelyBinaryMetadata(text: string, ext: string): boolean {
  if (!(ext === "pdf" || ext === "docx")) {
    return false;
  }

  const lowered = text.toLowerCase();
  const markers = ["%pdf", " obj ", "endobj", "xref", "stream", "endstream", "/type", "/catalog", "word/document.xml"];
  const markerHits = markers.filter((m) => lowered.includes(m)).length;
  const letterCount = (text.match(/[a-z]/gi) || []).length;
  const longWordCount = (text.match(/[a-z]{4,}/gi) || []).length;
  const letterRatio = text.length ? letterCount / text.length : 0;

  const severeMarkerNoise = markerHits >= 6;
  const weakLanguageSignal = letterRatio < 0.25 || longWordCount < 20;

  return severeMarkerNoise && weakLanguageSignal;
}

function isPdfStructureNoise(text: string, ext: string): boolean {
  if (ext !== "pdf") {
    return false;
  }

  const lowered = text.toLowerCase();
  const syntaxMarkers = [
    "/structtreeroot",
    "/viewerpreferences",
    "/markinfo",
    "/parent",
    "/resources",
    "/extgstate",
    "/kids",
    "/page",
  ];

  const hits = syntaxMarkers.filter((m) => lowered.includes(m)).length;
  const slashTokenCount = (text.match(/\/[A-Za-z]+/g) || []).length;
  const longWordCount = (text.match(/[A-Za-z]{5,}/g) || []).length;

  const strongNaturalLanguageSignal = longWordCount >= 45;

  return !strongNaturalLanguageSignal && (hits >= 3 || slashTokenCount >= 18);
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "File is required" }, { status: 422 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const extraction = await extractTextFromFile(file);
  const text = normalizeReadableText(extraction.text);

  const unreadableBinary = extraction.usedFallback && isLikelyBinaryMetadata(text, ext);
  const structureNoise = isPdfStructureNoise(text, ext);
  const unreadableText = extraction.usedFallback && isClearlyUnreadableText(text);
  const weakPdfLanguageSignal = ext === "pdf" && !hasHumanLanguageSignal(text);
  const emptyBinaryDoc = !text.trim() && (ext === "pdf" || ext === "docx");

  if (unreadableBinary || structureNoise || unreadableText || weakPdfLanguageSignal || emptyBinaryDoc) {
    const doc = createStoredDocument(userId, file.name || "uploaded.txt", "");
    return NextResponse.json({
      document_id: doc.document_id,
      filename: doc.filename,
      text_preview: "",
      extraction_warning: "Could not extract readable text from this file. Paste source text manually, then run analysis.",
    });
  }

  if (!text.trim()) {
    return NextResponse.json({ detail: "Document text is empty" }, { status: 400 });
  }

  const doc = createStoredDocument(userId, file.name || "uploaded.txt", text);

  return NextResponse.json({
    document_id: doc.document_id,
    filename: doc.filename,
    text_preview: doc.text.slice(0, 200),
  });
}
