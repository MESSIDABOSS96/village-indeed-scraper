import { NextResponse } from "next/server";
import { getInboxItems } from "@/lib/sheets";

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
