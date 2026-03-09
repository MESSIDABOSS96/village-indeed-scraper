import { NextRequest, NextResponse } from "next/server";
import { getInboxItems } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const apiKey = process.env.EXTENSION_API_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!apiKey || !token || token !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await getInboxItems();
  const urls = items.map((i) => i.indeedApplicationId).filter(Boolean);
  return NextResponse.json({ urls });
}
