"use client";

import type { ProcessingFile, ColumnDef, FieldKey } from "@/lib/types";
import { COLUMNS } from "@/lib/constants";
import FieldCell from "./FieldCell";
import ScreeningCell from "./ScreeningCell";

interface ReviewRowProps {
  file: ProcessingFile;
  onFieldChange: (field: FieldKey, value: string) => void;
  saving: boolean;
  enableScreening?: boolean;
  onScreenshotUpload?: (file: File) => void;
}

export default function ReviewRow({
  file,
  onFieldChange,
  saving,
  enableScreening = false,
  onScreenshotUpload,
}: ReviewRowProps) {
  if (!file.record) {
    return (
      <tr>
        <td className="px-2 py-2 text-xs text-gray-500 sticky left-0 bg-gray-900 z-10 border-r border-gray-700">
          {file.fileName}
        </td>
        <td
          colSpan={COLUMNS.length + (enableScreening ? 1 : 0)}
          className="px-4 py-2 text-xs text-red-400"
        >
          {file.error || "Failed to process"}
        </td>
      </tr>
    );
  }

  const errorCount = file.issues?.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = file.issues?.filter((i) => i.severity === "warning").length ?? 0;

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      <td className="px-2 py-2 align-top sticky left-0 bg-gray-900 z-10 border-r border-gray-700 min-w-[180px]">
        <div className="text-xs font-medium text-gray-100 truncate">
          {file.fileName}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {errorCount > 0 && (
            <span className="text-[11px] font-medium text-red-400">
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[11px] font-medium text-yellow-400">
              {warningCount} warning{warningCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </td>
      {enableScreening && onScreenshotUpload && (
        <ScreeningCell
          step={file.screeningStep}
          fileName={file.screeningFileName}
          error={file.screeningError}
          onUpload={onScreenshotUpload}
          disabled={saving}
        />
      )}
      {COLUMNS.map((col: ColumnDef) => (
        <FieldCell
          key={col.key}
          column={col}
          value={file.record![col.key] ?? ""}
          issues={file.issues?.filter((i) => i.field === col.key) ?? []}
          onChange={(val) => onFieldChange(col.key, val)}
        />
      ))}
    </tr>
  );
}
