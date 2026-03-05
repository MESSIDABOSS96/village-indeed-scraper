import { NextRequest, NextResponse } from "next/server";
import { getInboxItems, deduplicateInbox } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getInboxItems();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to fetch inbox: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "deduplicate") {
      const result = await deduplicateInbox();
      return NextResponse.json({
        status: "ok",
        removed: result.removed,
        message: `Removed ${result.removed} duplicate rows`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Action failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
