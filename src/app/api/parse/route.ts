import { NextRequest, NextResponse } from "next/server";
import { extractTextFromPdf } from "@/lib/pdf";
import type { ParseResult } from "@/lib/types";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed` },
        { status: 400 }
      );
    }

    const results: ParseResult[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          fileName: file.name,
          error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        });
        continue;
      }

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        results.push({
          fileName: file.name,
          error: "Only PDF files are supported",
        });
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const text = await extractTextFromPdf(buffer);
        results.push({ fileName: file.name, text });
      } catch (err) {
        results.push({
          fileName: file.name,
          error: `Failed to parse PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
