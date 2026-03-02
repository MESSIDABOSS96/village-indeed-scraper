import { NextRequest, NextResponse } from "next/server";
import { appendToSheet } from "@/lib/sheets";
import type { ResumeRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records } = body as { records: ResumeRecord[] };

    if (!records?.length) {
      return NextResponse.json(
        { error: "No records provided" },
        { status: 400 }
      );
    }

    const result = await appendToSheet(records);

    return NextResponse.json({
      success: true,
      updatedRange: result.updatedRange,
      updatedRows: result.updatedRows,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: `Failed to save to Google Sheets: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
