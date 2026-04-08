"use client";

import { useState, useCallback } from "react";
import type {
  ProcessingFile,
  ResumeRecord,
  FieldKey,
  ParseResult,
  ExtractResult,
} from "@/lib/types";
import { calculateLeadScore } from "@/lib/scoring";

const EXTRACT_CONCURRENCY = 3;

async function processWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

type Phase = "upload" | "processing" | "review";

export function useResumeProcessor() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const processFiles = useCallback(async (pdfFiles: File[]) => {
    setPhase("processing");
    setSaveResult(null);

    // Initialize processing state
    const initial: ProcessingFile[] = pdfFiles.map((f, i) => ({
      id: `file-${i}-${Date.now()}`,
      fileName: f.name,
      step: "extracting-text" as const,
    }));
    setFiles(initial);

    // Step 1: Parse PDFs
    const formData = new FormData();
    pdfFiles.forEach((f) => formData.append("files", f));

    let parseResults: ParseResult[];
    try {
      const parseRes = await fetch("/api/parse", { method: "POST", body: formData });
      if (!parseRes.ok) {
        throw new Error(`Parse API returned ${parseRes.status}`);
      }
      const parseData = await parseRes.json();
      parseResults = parseData.results;
    } catch {
      setFiles((prev) =>
        prev.map((f) => ({ ...f, step: "error" as const, error: "Failed to parse PDFs" }))
      );
      return;
    }

    // Update state with parse results and move to AI stage
    const withText = initial.map((f, i) => {
      const pr = parseResults[i];
      if (pr?.error) {
        return { ...f, step: "error" as const, error: pr.error };
      }
      return { ...f, rawText: pr?.text, step: "ai-stage-1" as const };
    });
    setFiles(withText);

    // Step 2: Extract via Claude — per-file with concurrency control
    const textsToExtract = withText
      .filter((f) => f.step === "ai-stage-1" && f.rawText)
      .map((f) => ({ fileName: f.fileName, text: f.rawText! }));

    if (textsToExtract.length === 0) {
      setPhase("review");
      return;
    }

    const extractResults = await processWithConcurrency(
      textsToExtract,
      async ({ fileName, text }): Promise<ExtractResult> => {
        // Mark this file as ai-stage-2
        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === fileName && f.step === "ai-stage-1"
              ? { ...f, step: "ai-stage-2" as const }
              : f
          )
        );

        try {
          const extractRes = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: [{ fileName, text }] }),
          });

          if (!extractRes.ok) {
            throw new Error(`Extract API returned ${extractRes.status}`);
          }

          const extractData = await extractRes.json();
          const result: ExtractResult = extractData.results[0];

          // Update this file immediately on completion
          setFiles((prev) =>
            prev.map((f) => {
              if (f.fileName !== fileName || f.step !== "ai-stage-2") return f;
              if (result?.status === "error") {
                return { ...f, step: "error" as const, error: result.error };
              }
              return {
                ...f,
                step: "linkedin-lookup" as const,
                record: result.record,
                issues: result.issues,
                confidenceNotes: result.confidenceNotes,
              };
            })
          );

          return result;
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "AI extraction failed";
          setFiles((prev) =>
            prev.map((f) =>
              f.fileName === fileName && f.step === "ai-stage-2"
                ? { ...f, step: "error" as const, error: errorMsg }
                : f
            )
          );
          return {
            record: {} as ExtractResult["record"],
            issues: [],
            confidenceNotes: {},
            rawText: text,
            status: "error" as const,
            error: errorMsg,
          };
        }
      },
      EXTRACT_CONCURRENCY
    );

    // Step 3: LinkedIn lookup for records missing LinkedIn URL
    const lookupsNeeded = extractResults
      .filter((r) => r.status === "success" && r.record && !r.record.linkedinUrl)
      .map((r) => ({
        id: r.record.id,
        firstName: r.record.firstName,
        lastName: r.record.lastName,
        city: r.record.city || undefined,
        state: r.record.stateRegion || undefined,
      }));

    if (lookupsNeeded.length > 0) {
      try {
        const linkedinRes = await fetch("/api/linkedin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lookups: lookupsNeeded }),
        });
        const linkedinData = await linkedinRes.json();
        const linkedinResults: { id: string; linkedinUrl: string | null }[] =
          linkedinData.results;

        // Merge LinkedIn URLs back
        setFiles((prev) =>
          prev.map((f) => {
            if (!f.record) return f;
            const match = linkedinResults.find((lr) => lr.id === f.record!.id);
            if (match?.linkedinUrl) {
              return {
                ...f,
                step: "done" as const,
                record: { ...f.record!, linkedinUrl: match.linkedinUrl },
              };
            }
            return { ...f, step: "done" as const };
          })
        );
      } catch {
        // LinkedIn failure is non-fatal
        setFiles((prev) =>
          prev.map((f) =>
            f.step === "linkedin-lookup" ? { ...f, step: "done" as const } : f
          )
        );
      }
    } else {
      setFiles((prev) =>
        prev.map((f) =>
          f.step === "linkedin-lookup" ? { ...f, step: "done" as const } : f
        )
      );
    }

    setPhase("review");
  }, []);

  const SCORING_FIELDS: FieldKey[] = [
    "sessionPreference",
    "yearsOutOfSchool",
    "licenseType",
    "city",
    "stateRegion",
  ];

  const updateField = useCallback(
    (recordId: string, field: FieldKey, value: string) => {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.record?.id !== recordId) return f;
          const updated = { ...f.record, [field]: value };

          // Recalculate lead score when scoring-relevant fields change
          if (SCORING_FIELDS.includes(field)) {
            const autoScore = calculateLeadScore(updated);
            if (autoScore) {
              updated.leadScore = autoScore;
            }
          }

          return {
            ...f,
            record: updated,
            // Remove issues for this field when manually edited
            issues: f.issues?.filter((i) => i.field !== field),
          };
        })
      );
    },
    []
  );

  const saveToSheet = useCallback(
    async (recordIds?: string[]) => {
      setSaving(true);
      setSaveResult(null);

      const recordsToSave = files
        .filter((f) => f.record && (recordIds ? recordIds.includes(f.record.id) : true))
        .map((f) => f.record!);

      if (recordsToSave.length === 0) {
        setSaveResult({ success: false, message: "No records to save" });
        setSaving(false);
        return;
      }

      try {
        // Save to Sheets and HubSpot in parallel
        const [sheetsRes, hubspotRes] = await Promise.allSettled([
          fetch("/api/sheets/append", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: recordsToSave }),
          }).then((r) => r.json()),
          fetch("/api/hubspot/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: recordsToSave }),
          }).then((r) => r.json()),
        ]);

        const messages: string[] = [];
        let anySuccess = false;

        // Handle Sheets result
        if (sheetsRes.status === "fulfilled" && sheetsRes.value.success) {
          const skipped = sheetsRes.value.skipped ?? 0;
          const msg = skipped > 0
            ? `Saved ${sheetsRes.value.updatedRows} row(s) to Sheets (${skipped} duplicate(s) skipped)`
            : `Saved ${sheetsRes.value.updatedRows} row(s) to Sheets`;
          messages.push(msg);
          anySuccess = true;
        } else if (sheetsRes.status === "fulfilled") {
          messages.push(`Sheets: ${sheetsRes.value.error || "failed"}`);
        } else {
          messages.push("Sheets: network error");
        }

        // Handle HubSpot result
        if (hubspotRes.status === "fulfilled") {
          if (hubspotRes.value.message) {
            messages.push(hubspotRes.value.message);
            if (hubspotRes.value.updated > 0 || hubspotRes.value.created > 0) {
              anySuccess = true;
            }
          }
        } else {
          messages.push("HubSpot: network error");
        }

        setSaveResult({
          success: anySuccess,
          message: messages.join(" · "),
        });
      } catch {
        setSaveResult({
          success: false,
          message: "Network error saving",
        });
      } finally {
        setSaving(false);
      }
    },
    [files]
  );

  const reset = useCallback(() => {
    setPhase("upload");
    setFiles([]);
    setSaveResult(null);
  }, []);

  return {
    phase,
    files,
    saving,
    saveResult,
    processFiles,
    updateField,
    saveToSheet,
    reset,
  };
}
