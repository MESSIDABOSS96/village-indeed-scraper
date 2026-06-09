import { NextRequest, NextResponse } from "next/server";
import { runScreeningExtraction } from "@/lib/claude";

export const maxDuration = 120;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SUPPORTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }

    if (!SUPPORTED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported image type — use PNG, JPEG, GIF, or WEBP" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const result = await runScreeningExtraction(
      base64,
      file.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read screenshot: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
