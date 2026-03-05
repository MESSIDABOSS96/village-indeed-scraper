"use client";

import type { InboxItem, Disposition, FieldKey } from "@/lib/types";
import ReviewTable from "./ReviewTable";
import SaveButton from "./SaveButton";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  processing: "bg-yellow-500/20 text-yellow-400",
  processed: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

const DISPOSITIONS: Disposition[] = [
  "New",
  "Reviewed",
  "Contacted",
  "Rejected",
  "Hired",
];

interface InboxViewProps {
  items: InboxItem[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveResult: { success: boolean; message: string } | null;
  onRetry: (id: string) => void;
  onRefresh: () => void;
  onDispositionChange: (id: string, disposition: Disposition) => void;
  onFieldChange: (recordId: string, field: FieldKey, value: string) => void;
  onSave: () => void;
  toProcessingFiles: (items: InboxItem[]) => import("@/lib/types").ProcessingFile[];
}

export default function InboxView({
  items,
  loading,
  error,
  saving,
  saveResult,
  onRetry,
  onRefresh,
  onDispositionChange,
  onFieldChange,
  onSave,
  toProcessingFiles,
}: InboxViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading inbox...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-red-400">Error: {error}</div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-gray-500 text-lg">No applications in inbox</div>
        <p className="text-gray-600 text-sm max-w-md text-center">
          Applications from Indeed Apply will appear here automatically when
          candidates apply to your jobs.
        </p>
        <button
          onClick={onRefresh}
          className="px-4 py-2 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
        >
          Refresh
        </button>
      </div>
    );
  }

  const errorItems = items.filter((i) => i.status === "error");
  const newItems = items.filter(
    (i) => i.status === "new" || i.status === "processing"
  );
  const processedItems = items.filter((i) => i.status === "processed");
  const processingFiles = toProcessingFiles(processedItems);
  const recordCount = processingFiles.filter((f) => f.record).length;

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-100">
            Indeed Inbox
          </h2>
          <span className="text-sm text-gray-400">
            {items.length} application{items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="text-sm px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Refresh
          </button>
          {processedItems.length > 0 && (
            <SaveButton
              onSave={onSave}
              saving={saving}
              result={saveResult}
              recordCount={recordCount}
              files={processingFiles}
            />
          )}
        </div>
      </div>

      {/* Status summary */}
      {(newItems.length > 0 || errorItems.length > 0) && (
        <div className="space-y-3">
          {/* New/Processing items */}
          {newItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status]}`}
                >
                  {item.status}
                </span>
                <span className="text-gray-200">{item.applicantName}</span>
                <span className="text-gray-500 text-sm">
                  {item.resumeFileName}
                </span>
                {item.jobTitle && (
                  <span className="text-gray-600 text-sm">
                    - {item.jobTitle}
                  </span>
                )}
              </div>
              <span className="text-gray-500 text-xs">
                {new Date(item.receivedAt).toLocaleString()}
              </span>
            </div>
          ))}

          {/* Error items */}
          {errorItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-red-950/30 border border-red-900/50"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS.error}`}
                >
                  error
                </span>
                <span className="text-gray-200">{item.applicantName}</span>
                <span className="text-red-400 text-sm">
                  {item.errorMessage}
                </span>
              </div>
              <button
                onClick={() => onRetry(item.id)}
                className="text-sm px-3 py-1 rounded-md bg-red-900/50 text-red-300 hover:bg-red-900/80 transition-colors"
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Disposition controls for processed items */}
      {processedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Dispositions
          </h3>
          <div className="flex flex-wrap gap-2">
            {processedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700"
              >
                <span className="text-sm text-gray-300">
                  {item.applicantName}
                </span>
                <select
                  value={item.disposition}
                  onChange={(e) =>
                    onDispositionChange(
                      item.id,
                      e.target.value as Disposition
                    )
                  }
                  className="text-xs bg-gray-700 text-gray-300 rounded px-2 py-1 border border-gray-600"
                >
                  {DISPOSITIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review table for processed items */}
      {processingFiles.length > 0 && (
        <ReviewTable
          files={processingFiles}
          onFieldChange={onFieldChange}
          saving={saving}
        />
      )}
    </div>
  );
}
