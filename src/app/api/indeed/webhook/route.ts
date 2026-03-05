import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  verifyHmacSignature,
  parseWebhookPayload,
  mapScreenerAnswers,
  decodeResume,
} from "@/lib/indeed";
import { runStage1, runStage2 } from "@/lib/claude";
import { validateAndNormalize } from "@/lib/validation";
import { calculateLeadScore } from "@/lib/scoring";
import {
  appendToInbox,
  findInboxByIndeedId,
  updateInboxItem,
} from "@/lib/sheets";
import type { InboxItem } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // 1. HMAC signature verification
    const secret = process.env.INDEED_WEBHOOK_SECRET;
    if (secret) {
      const signature = request.headers.get("x-indeed-signature") ?? "";
      if (!signature || !verifyHmacSignature(rawBody, signature, secret)) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // 2. Parse payload
    const parsed = JSON.parse(rawBody);
    const payload = parseWebhookPayload(parsed);

    // 3. Idempotency check
    const existing = await findInboxByIndeedId(payload.id);
    if (existing) {
      return NextResponse.json({ status: "duplicate", id: existing.id });
    }

    // 4. Save to Inbox immediately (ensures data survives timeouts)
    const itemId = uuidv4();
    const screenerData = payload.questionsAndAnswers
      ? mapScreenerAnswers(payload.questionsAndAnswers)
      : { sessionPreference: "", interviewAvailability: "" };

    const inboxItem: InboxItem = {
      id: itemId,
      indeedApplicationId: payload.id,
      status: "processing",
      receivedAt: payload.appliedDate || new Date().toISOString(),
      applicantName: payload.applicant.fullName,
      resumeFileName: payload.resume.fileName,
      jobTitle: payload.job?.title ?? "",
      disposition: "New",
      interviewAvailability: screenerData.interviewAvailability || undefined,
    };

    await appendToInbox(inboxItem);

    // 5. Decode resume and extract text
    let resumeText: string;
    try {
      resumeText = await decodeResume(
        payload.resume.data,
        payload.resume.contentType
      );
    } catch (err) {
      await updateInboxItem(itemId, {
        status: "error",
        errorMessage: `Resume decode failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      return NextResponse.json({ status: "error", id: itemId });
    }

    // Truncate to fit Sheets cell limit (50K chars)
    const truncatedText = resumeText.slice(0, 49000);
    await updateInboxItem(itemId, { resumeText: truncatedText });

    // 6. Run through AI extraction pipeline
    try {
      const stage1 = await runStage1(resumeText);
      const stage2 = await runStage2(stage1);
      const { record, issues, confidenceNotes } = validateAndNormalize(
        stage2,
        stage1
      );

      // 7. Merge screener-derived fields
      if (screenerData.sessionPreference) {
        record.sessionPreference = screenerData.sessionPreference;
      }

      // Merge contact info from Indeed payload
      if (!record.email && payload.applicant.email) {
        record.email = payload.applicant.email;
      }
      if (!record.phoneNumber && payload.applicant.phoneNumber) {
        record.phoneNumber = payload.applicant.phoneNumber;
      }

      // 8. Calculate lead score (sessionPreference from screener enables this)
      const leadScore = calculateLeadScore(record);
      if (leadScore) {
        record.leadScore = leadScore;
      }

      // 9. Update Inbox row with processed data
      await updateInboxItem(itemId, {
        status: "processed",
        processedRecord: record,
        issues,
        confidenceNotes,
        resumeText: truncatedText,
      });

      return NextResponse.json({ status: "processed", id: itemId });
    } catch (err) {
      await updateInboxItem(itemId, {
        status: "error",
        errorMessage: `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        resumeText: truncatedText,
      });
      return NextResponse.json({ status: "error", id: itemId });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Webhook error: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
