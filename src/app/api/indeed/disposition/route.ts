import { NextRequest, NextResponse } from "next/server";
import { getInboxItems, updateInboxItem } from "@/lib/sheets";
import type { Disposition } from "@/lib/types";

const VALID_DISPOSITIONS: Disposition[] = [
  "New",
  "Reviewed",
  "Contacted",
  "Rejected",
  "Hired",
];

export async function POST(request: NextRequest) {
  try {
    const { updates } = (await request.json()) as {
      updates: { id: string; disposition: Disposition }[];
    };

    if (!updates?.length) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    // Validate dispositions
    for (const u of updates) {
      if (!VALID_DISPOSITIONS.includes(u.disposition)) {
        return NextResponse.json(
          { error: `Invalid disposition: ${u.disposition}` },
          { status: 400 }
        );
      }
    }

    // Update local sheet
    const results: { id: string; status: string }[] = [];
    for (const { id, disposition } of updates) {
      try {
        await updateInboxItem(id, { disposition });
        results.push({ id, status: "updated" });
      } catch {
        results.push({ id, status: "error" });
      }
    }

    // TODO: Call Indeed's GraphQL Disposition Sync API when credentials are available
    // This requires an Indeed API key and employer account integration.
    // For now, dispositions are tracked locally in the Inbox sheet.

    return NextResponse.json({ results, synced: false });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Disposition error: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}

// GET: Fetch current inbox items (used by disposition UI to show current state)
export async function GET() {
  try {
    const items = await getInboxItems();
    const dispositions = items.map((i) => ({
      id: i.id,
      applicantName: i.applicantName,
      disposition: i.disposition,
      indeedApplicationId: i.indeedApplicationId,
    }));
    return NextResponse.json({ dispositions });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch dispositions: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
