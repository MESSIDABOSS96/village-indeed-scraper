import { extractText } from "unpdf";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("PDF parsing timed out after 30s")), 30000)
  );
  const result = await Promise.race([
    extractText(new Uint8Array(buffer)),
    timeout,
  ]);
  return result.text.join("\n");
}
