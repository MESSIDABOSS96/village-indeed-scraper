import { NextRequest, NextResponse } from "next/server";
import { runStage1, runStage2 } from "@/lib/claude";
import { validateAndNormalize } from "@/lib/validation";
import { calculateLeadScore } from "@/lib/scoring";
import { getInboxItems, updateInboxItem } from "@/lib/sheets";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string };

    if (!id) {
      return NextResponse.json({ error: "Missing inbox item id" }, { status: 400 });
    }

    // Find the inbox item
    const items = await getInboxItems();
    const item = items.find((i) => i.id === id);
    if (!item) {
      return NextResponse.json({ error: "Inbox item not found" }, { status: 404 });
    }

    if (!item.resumeText) {
      return NextResponse.json(
        { error: "No resume text available to process" },
        { status: 400 }
      );
    }

    await updateInboxItem(id, { status: "processing", errorMessage: "" });

    try {
      const stage1 = await runStage1(item.resumeText);
      const stage2 = await runStage2(stage1);
      const { record, issues, confidenceNotes } = validateAndNormalize(stage2, stage1);

      // Preserve sessionPreference if it was set from screener
      if (item.processedRecord?.sessionPreference) {
        record.sessionPreference = item.processedRecord.sessionPreference;
      }

      const leadScore = calculateLeadScore(record);
      if (leadScore) {
        record.leadScore = leadScore;
      }

      await updateInboxItem(id, {
        status: "processed",
        processedRecord: record,
        issues,
        confidenceNotes,
        errorMessage: undefined,
      });

      return NextResponse.json({ status: "processed", id });
    } catch (err) {
      await updateInboxItem(id, {
        status: "error",
        errorMessage: `Reprocess failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      return NextResponse.json({ status: "error", id });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
