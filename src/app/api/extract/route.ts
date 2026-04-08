import { NextRequest, NextResponse } from "next/server";
import { runStage1, runStage2 } from "@/lib/claude";
import { validateAndNormalize } from "@/lib/validation";
import type { ExtractResult } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { texts } = body as { texts: { fileName: string; text: string }[] };

    if (!texts?.length) {
      return NextResponse.json(
        { error: "No texts provided" },
        { status: 400 }
      );
    }

    const results: ExtractResult[] = [];

    for (const { fileName, text } of texts) {
      try {
        // Stage 1: Raw extraction
        const stage1 = await runStage1(text);

        // Stage 2: Schema mapping
        const stage2 = await runStage2(stage1);

        // Validation pipeline
        const { record, issues, confidenceNotes } = validateAndNormalize(stage2, stage1);

        results.push({
          record,
          issues,
          confidenceNotes,
          rawText: text,
          status: "success",
        });
      } catch (err) {
        results.push({
          record: {} as ExtractResult["record"],
          issues: [],
          confidenceNotes: {},
          rawText: text,
          status: "error",
          error: `Extraction failed for ${fileName}: ${err instanceof Error ? err.message : "Unknown error"}`,
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
