import crypto from "crypto";
import { extractText } from "unpdf";
import type { IndeedWebhookPayload } from "./types";

export function verifyHmacSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const computed = crypto
    .createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // timingSafeEqual throws on length mismatch, so guard against malformed signatures
  const computedBuf = Buffer.from(computed, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (computedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(computedBuf, signatureBuf);
}

export function parseWebhookPayload(raw: unknown): IndeedWebhookPayload {
  const data = raw as Record<string, unknown>;
  if (!data?.id || !data?.applicant || !data?.resume) {
    throw new Error("Invalid Indeed webhook payload: missing required fields");
  }
  return data as unknown as IndeedWebhookPayload;
}

/**
 * Maps Jackson's screener questions to structured fields.
 * Returns sessionPreference and interviewAvailability.
 */
export function mapScreenerAnswers(
  qa: { question: string; answer: string }[]
): { sessionPreference: string; interviewAvailability: string } {
  let sessionPreference = "";
  let interviewAvailability = "";

  for (const { question, answer } of qa) {
    const q = question.toLowerCase();
    console.log(`[Screener] Q: "${question}" | A: "${answer}"`);
    console.log(`[Screener] in-home match: ${q.includes("in-home visits") || q.includes("in home visits")}`);
    if (q.includes("in-home visits") || q.includes("in home visits")) {
      const a = answer.toLowerCase().trim();
      if (a === "yes" || a.startsWith("yes")) {
        sessionPreference = "In-Home";
      } else {
        sessionPreference = "Virtual";
      }
    }
    if (q.includes("dates and time") || q.includes("availability")) {
      interviewAvailability = answer;
    }
  }

  console.log(`[Screener] Result: sessionPreference="${sessionPreference}", interviewAvailability="${interviewAvailability}"`);
  return { sessionPreference, interviewAvailability };
}

/**
 * Decode base64 resume data and extract text using unpdf.
 */
export async function decodeResume(
  base64Data: string,
  contentType: string
): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");

  if (contentType === "application/pdf" || contentType.includes("pdf")) {
    const result = await extractText(new Uint8Array(buffer));
    return result.text.join("\n");
  }

  // For plain text or other formats, decode as UTF-8
  return buffer.toString("utf-8");
}
