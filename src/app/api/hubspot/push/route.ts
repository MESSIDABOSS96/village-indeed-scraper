import { NextResponse } from "next/server";
import { pushContactsToHubSpot } from "@/lib/hubspot";
import type { ResumeRecord } from "@/lib/types";
import rules from "../../../../../config/rules.json";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const records: ResumeRecord[] = body.records;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: "No records provided" },
        { status: 400 }
      );
    }

    const ownerName =
      (rules as Record<string, unknown>).hubspotOwnerName as string ||
      rules.constants.contactOwner;

    const result = await pushContactsToHubSpot(records, ownerName);
    return NextResponse.json(result);
  } catch (err) {
    console.error("HubSpot push route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
