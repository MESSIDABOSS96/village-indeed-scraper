import { NextRequest, NextResponse } from "next/server";
import { lookupLinkedIn } from "@/lib/linkedin";
import type { LinkedInLookup } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lookups } = body as { lookups: LinkedInLookup[] };

    if (!lookups?.length) {
      return NextResponse.json(
        { error: "No lookups provided" },
        { status: 400 }
      );
    }

    const results: { id: string; linkedinUrl: string | null }[] = [];

    // Sequential to respect API rate limits
    for (const lookup of lookups) {
      const { linkedinUrl } = await lookupLinkedIn(
        lookup.firstName,
        lookup.lastName,
        lookup.city,
        lookup.state
      );
      results.push({ id: lookup.id, linkedinUrl });
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
