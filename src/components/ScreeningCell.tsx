"use client";

import { useCallback, useRef, useState } from "react";

interface ScreeningCellProps {
  step?: "processing" | "done" | "error";
  fileName?: string;
  error?: string;
  onUpload: (file: File) => void;
  disabled?: boolean;
}

export default function ScreeningCell({
  step,
  fileName,
  error,
  onUpload,
  disabled,
}: ScreeningCellProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (disabled) return;
      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.type.startsWith("image/")
      );
      if (file) onUpload(file);
    },
    [onUpload, disabled]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
      e.target.value = ""; // allow re-uploading the same file
    },
    [onUpload]
  );

  const isProcessing = step === "processing";

  return (
    <td className="px-2 py-1.5 align-top min-w-[160px] max-w-[200px]">
      <button
        type="button"
        onClick={() => !disabled && !isProcessing && inputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        disabled={disabled || isProcessing}
        className={`w-full text-left text-xs px-2 py-2 rounded border border-dashed transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-900/30"
            : step === "error"
            ? "border-red-700 bg-red-900/20"
            : step === "done"
            ? "border-green-800 bg-green-900/20"
            : "border-gray-600 bg-gray-800 hover:border-gray-500"
        } disabled:opacity-60`}
      >
        {isProcessing ? (
          <span className="text-gray-300">Reading…</span>
        ) : step === "done" ? (
          <span className="text-green-400 truncate block">
            ✓ {fileName ?? "screenshot"} — re-drop to replace
          </span>
        ) : step === "error" ? (
          <span className="text-red-400 truncate block">
            ✗ {error ?? "Failed"} — drop to retry
          </span>
        ) : (
          <span className="text-gray-400">Drop screening screenshot</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
    </td>
  );
}
