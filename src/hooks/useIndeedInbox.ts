"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  InboxItem,
  ProcessingFile,
  FieldKey,
  Disposition,
} from "@/lib/types";
import { calculateLeadScore } from "@/lib/scoring";

export function useIndeedInbox(active: boolean = false) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/indeed/inbox");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setHasFetched(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch inbox"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Only fetch when the inbox tab becomes active (and hasn't been fetched yet)
  useEffect(() => {
    if (active && !hasFetched) {
      fetchInbox();
    }
  }, [active, hasFetched, fetchInbox]);

  const retryItem = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, status: "processing" as const } : i
      )
    );

    try {
      const res = await fetch("/api/indeed/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();

      if (data.status === "processed") {
        await fetchInbox();
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id
              ? { ...i, status: "error" as const, errorMessage: "Retry failed" }
              : i
          )
        );
      }
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, status: "error" as const, errorMessage: "Network error" }
            : i
        )
      );
    }
  }, [fetchInbox]);

  const updateDisposition = useCallback(
    async (id: string, disposition: Disposition) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, disposition } : i))
      );

      await fetch("/api/indeed/disposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ id, disposition }] }),
      });
    },
    []
  );

  // Convert processed InboxItems to ProcessingFiles for ReviewTable compatibility
  const toProcessingFiles = useCallback(
    (inboxItems: InboxItem[]): ProcessingFile[] => {
      return inboxItems
        .filter((i) => i.status === "processed" && i.processedRecord)
        .map((i) => ({
          id: i.processedRecord!.id,
          fileName: `${i.applicantName} (Indeed)`,
          step: "done" as const,
          record: i.processedRecord!,
          issues: i.issues,
          confidenceNotes: i.confidenceNotes,
        }));
    },
    []
  );

  const SCORING_FIELDS: FieldKey[] = [
    "sessionPreference",
    "yearsOutOfSchool",
    "licenseType",
    "city",
    "stateRegion",
  ];

  const updateField = useCallback(
    (recordId: string, field: FieldKey, value: string) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.processedRecord?.id !== recordId) return i;
          const updated = { ...i.processedRecord, [field]: value };

          if (SCORING_FIELDS.includes(field)) {
            const autoScore = calculateLeadScore(updated);
            if (autoScore) updated.leadScore = autoScore;
          }

          return {
            ...i,
            processedRecord: updated,
            issues: i.issues?.filter((iss) => iss.field !== field),
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

      const recordsToSave = items
        .filter(
          (i) =>
            i.status === "processed" &&
            i.processedRecord &&
            (recordIds
              ? recordIds.includes(i.processedRecord.id)
              : true)
        )
        .map((i) => i.processedRecord!);

      if (recordsToSave.length === 0) {
        setSaveResult({ success: false, message: "No records to save" });
        setSaving(false);
        return;
      }

      try {
        const res = await fetch("/api/sheets/append", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: recordsToSave }),
        });
        const data = await res.json();

        if (data.success) {
          setSaveResult({
            success: true,
            message: `Saved ${data.updatedRows} row(s) to Google Sheets`,
          });

          // Auto-set disposition to "Reviewed" for saved items
          const savedIds = items
            .filter(
              (i) =>
                i.status === "processed" &&
                i.processedRecord &&
                (recordIds
                  ? recordIds.includes(i.processedRecord.id)
                  : true)
            )
            .map((i) => i.id);

          for (const id of savedIds) {
            await updateDisposition(id, "Reviewed");
          }
        } else {
          setSaveResult({
            success: false,
            message: data.error || "Failed to save",
          });
        }
      } catch {
        setSaveResult({
          success: false,
          message: "Network error saving to Google Sheets",
        });
      } finally {
        setSaving(false);
      }
    },
    [items, updateDisposition]
  );

  const newCount = items.filter(
    (i) => i.status === "new" || i.status === "processing"
  ).length;

  return {
    items,
    loading,
    error,
    saving,
    saveResult,
    newCount,
    fetchInbox,
    retryItem,
    updateDisposition,
    toProcessingFiles,
    updateField,
    saveToSheet,
  };
}
