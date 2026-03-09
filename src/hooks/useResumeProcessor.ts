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

    // Step 2: Extract via Claude (only files that parsed successfully)
    const textsToExtract = withText
      .filter((f) => f.step === "ai-stage-1" && f.rawText)
      .map((f) => ({ fileName: f.fileName, text: f.rawText! }));

    if (textsToExtract.length === 0) {
      setPhase("review");
      return;
    }

    // Update to show AI processing
    setFiles((prev) =>
      prev.map((f) =>
        f.step === "ai-stage-1" ? { ...f, step: "ai-stage-2" as const } : f
      )
    );

    let extractResults: ExtractResult[];
    try {
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: textsToExtract }),
      });
      const extractData = await extractRes.json();
      extractResults = extractData.results;
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.step === "ai-stage-2"
            ? { ...f, step: "error" as const, error: "AI extraction failed" }
            : f
        )
      );
      setPhase("review");
      return;
    }

    // Map extract results back to files
    let extractIdx = 0;
    const afterExtract = withText.map((f) => {
      if (f.step !== "ai-stage-1") return f; // errored files stay as-is
      const er = extractResults[extractIdx++];
      if (er?.status === "error") {
        return { ...f, step: "error" as const, error: er.error };
      }
      return {
        ...f,
        step: "linkedin-lookup" as const,
        record: er.record,
        issues: er.issues,
        confidenceNotes: er.confidenceNotes,
      };
    });
    setFiles(afterExtract);

    // Step 3: LinkedIn lookup for records missing LinkedIn URL
    const lookupsNeeded = afterExtract
      .filter((f) => f.record && !f.record.linkedinUrl)
      .map((f) => ({
        id: f.record!.id,
        firstName: f.record!.firstName,
        lastName: f.record!.lastName,
        city: f.record!.city || undefined,
        state: f.record!.stateRegion || undefined,
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
          messages.push(`Saved ${sheetsRes.value.updatedRows} row(s) to Sheets`);
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
