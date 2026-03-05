import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mapScreenerAnswers } from "@/lib/indeed";
import { runStage1, runStage2 } from "@/lib/claude";
import { validateAndNormalize } from "@/lib/validation";
import { calculateLeadScore } from "@/lib/scoring";
import { extractTextFromPdf } from "@/lib/pdf";
import {
  appendToInbox,
  findInboxByIndeedId,
  findInboxByName,
  updateInboxItem,
} from "@/lib/sheets";
import type { InboxItem } from "@/lib/types";

export const maxDuration = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

interface IngestPayload {
  indeedCandidateUrl: string;
  applicantName: string;
  location: string;
  jobTitle: string;
  resumeText: string;
  resumePdfBase64?: string;
  screenerAnswers?: { question: string; answer: string }[];
  scrapedAt: string;
}

function normalizeIndeedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id");
    if (id) {
      return `https://employers.indeed.com/candidates/view?id=${id}`;
    }
  } catch {}
  return url;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify API key
    const apiKey = process.env.EXTENSION_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { error: "Server not configured for extension ingestion" },
        500
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || token !== apiKey) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }

    // 2. Parse payload
    const payload: IngestPayload = await request.json();

    if (!payload.indeedCandidateUrl || !payload.applicantName) {
      return jsonResponse(
        { error: "Missing required fields: indeedCandidateUrl, applicantName" },
        400
      );
    }

    // 3. Normalize URL and dedup check
    const normalizedUrl = normalizeIndeedUrl(payload.indeedCandidateUrl);
    payload.indeedCandidateUrl = normalizedUrl;

    const existing = await findInboxByIndeedId(normalizedUrl);
    if (existing) {
      return jsonResponse({ status: "duplicate", id: existing.id });
    }

    // Secondary dedup: check by applicant name
    if (payload.applicantName) {
      const existingByName = await findInboxByName(payload.applicantName);
      if (existingByName) {
        return jsonResponse({ status: "duplicate", id: existingByName.id });
      }
    }

    // 4. Parse location into city + state
    let city = "";
    let state = "";
    if (payload.location) {
      const parts = payload.location.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
      } else {
        city = payload.location;
      }
    }

    // 5. Map screener answers
    const screenerData = payload.screenerAnswers?.length
      ? mapScreenerAnswers(payload.screenerAnswers)
      : { sessionPreference: "", interviewAvailability: "" };

    // 6. Save to Inbox immediately
    const itemId = uuidv4();
    const inboxItem: InboxItem = {
      id: itemId,
      indeedApplicationId: payload.indeedCandidateUrl,
      status: "processing",
      receivedAt: payload.scrapedAt || new Date().toISOString(),
      applicantName: payload.applicantName,
      resumeFileName: "scraped",
      jobTitle: payload.jobTitle || "",
      disposition: "New",
      interviewAvailability: screenerData.interviewAvailability || undefined,
    };

    await appendToInbox(inboxItem);

    // 7. Extract resume text: prefer PDF, fall back to DOM-scraped text
    let resumeText = payload.resumeText || "";

    if (payload.resumePdfBase64) {
      try {
        const pdfBuffer = Buffer.from(payload.resumePdfBase64, "base64");
        const pdfText = await extractTextFromPdf(pdfBuffer);
        if (pdfText && pdfText.trim().length > 0) {
          resumeText = pdfText;
          console.log("[Ingest] Extracted resume text from PDF:", pdfText.length, "chars");
        }
      } catch (pdfErr) {
        console.warn("[Ingest] PDF parsing failed, falling back to DOM text:", pdfErr);
      }
    }

    // Prepend known metadata so AI always has name/location/job even if PDF fails
    const metadataHeader = [
      "--- CANDIDATE INFO ---",
      payload.applicantName ? `Name: ${payload.applicantName}` : "",
      payload.location ? `Location: ${payload.location}` : "",
      payload.jobTitle ? `Job: ${payload.jobTitle}` : "",
      "--- RESUME TEXT ---",
    ]
      .filter(Boolean)
      .join("\n");
    const fullText = metadataHeader + "\n" + resumeText;

    const truncatedText = fullText.slice(0, 49000);
    await updateInboxItem(itemId, { resumeText: truncatedText });

    // 8. Run AI extraction pipeline
    if (!truncatedText) {
      await updateInboxItem(itemId, {
        status: "error",
        errorMessage: "No resume text extracted from page",
      });
      return jsonResponse({ status: "error", id: itemId });
    }

    try {
      const stage1 = await runStage1(truncatedText);
      const stage2 = await runStage2(stage1);
      const { record, issues, confidenceNotes } = validateAndNormalize(
        stage2,
        stage1
      );

      // Fallback: split applicantName if AI didn't extract first/last name
      if (!record.firstName && !record.lastName && payload.applicantName) {
        const parts = payload.applicantName.trim().split(/\s+/);
        record.firstName = parts[0] || "";
        record.lastName = parts.slice(1).join(" ") || "";
      }

      // 9. Merge screener-derived fields
      if (screenerData.sessionPreference) {
        record.sessionPreference = screenerData.sessionPreference;
      }

      // Merge location from scrape if AI didn't extract it
      if (!record.city && city) {
        record.city = city;
      }
      if (!record.stateRegion && state) {
        record.stateRegion = state;
      }

      // 10. Calculate lead score
      const leadScore = calculateLeadScore(record);
      if (leadScore) {
        record.leadScore = leadScore;
      }

      // 11. Update Inbox row with processed data
      await updateInboxItem(itemId, {
        status: "processed",
        processedRecord: record,
        issues,
        confidenceNotes,
        resumeText: truncatedText,
      });

      return jsonResponse({ status: "processed", id: itemId });
    } catch (err) {
      await updateInboxItem(itemId, {
        status: "error",
        errorMessage: `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        resumeText: truncatedText,
      });
      return jsonResponse({ status: "error", id: itemId });
    }
  } catch (err) {
    return jsonResponse(
      {
        error: `Ingest error: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      500
    );
  }
}
