"use client";

import { useState } from "react";
import type { ProcessingFile, FieldKey } from "@/lib/types";
import { COLUMNS } from "@/lib/constants";
import ReviewRow from "./ReviewRow";

interface ReviewTableProps {
  files: ProcessingFile[];
  onFieldChange: (recordId: string, field: FieldKey, value: string) => void;
  saving: boolean;
}

export default function ReviewTable({
  files,
  onFieldChange,
  saving,
}: ReviewTableProps) {
  const [filterNeedsReview, setFilterNeedsReview] = useState(false);

  const displayFiles = filterNeedsReview
    ? files.filter(
        (f) => f.issues && f.issues.length > 0
      )
    : files;

  const totalIssues = files.reduce(
    (sum, f) => sum + (f.issues?.length ?? 0),
    0
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-sm text-gray-400">
          {files.filter((f) => f.record).length} record
          {files.filter((f) => f.record).length !== 1 ? "s" : ""} extracted
          {totalIssues > 0 && (
            <span className="ml-2 text-yellow-500">
              ({totalIssues} issue{totalIssues !== 1 ? "s" : ""} to review)
            </span>
          )}
        </div>
        {totalIssues > 0 && (
          <button
            onClick={() => setFilterNeedsReview(!filterNeedsReview)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filterNeedsReview
                ? "bg-yellow-900/40 border-yellow-700 text-yellow-400"
                : "border-gray-600 text-gray-400 hover:bg-gray-800"
            }`}
          >
            {filterNeedsReview ? "Show All" : "Needs Review"}
          </button>
        )}
      </div>

      <div className="review-table-container overflow-x-auto border border-gray-700 rounded-xl shadow-lg shadow-black/20 bg-gray-900">
        <table className="w-max min-w-full">
          <thead>
            <tr className="bg-gray-800 border-b border-gray-700">
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-800 z-10 border-r border-gray-700 min-w-[180px]">
                File
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[140px] max-w-[200px]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayFiles.map((file) => (
              <ReviewRow
                key={file.id}
                file={file}
                onFieldChange={(field, value) => {
                  if (file.record) {
                    onFieldChange(file.record.id, field, value);
                  }
                }}
                saving={saving}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
