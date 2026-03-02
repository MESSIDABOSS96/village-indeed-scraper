"use client";

import type { ProcessingFile, ProcessingStep } from "@/lib/types";

const STEP_LABELS: Record<ProcessingStep, string> = {
  pending: "Waiting...",
  "extracting-text": "Extracting text from PDF...",
  "ai-stage-1": "AI reading resume...",
  "ai-stage-2": "AI mapping to schema...",
  "linkedin-lookup": "Looking up LinkedIn...",
  validating: "Validating data...",
  done: "Complete",
  error: "Error",
};

const STEP_ORDER: ProcessingStep[] = [
  "extracting-text",
  "ai-stage-1",
  "ai-stage-2",
  "linkedin-lookup",
  "done",
];

function StepDot({ active, complete, error }: { active: boolean; complete: boolean; error: boolean }) {
  if (error) {
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
    );
  }
  if (complete) {
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
    );
  }
  if (active) {
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
    );
  }
  return (
    <div className="w-2.5 h-2.5 rounded-full bg-gray-600" />
  );
}

export default function ProcessingStatus({ files }: { files: ProcessingFile[] }) {
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {files.map((file) => {
        const currentIdx = STEP_ORDER.indexOf(file.step);
        return (
          <div
            key={file.id}
            className="bg-gray-800 rounded-lg border border-gray-700 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-100 truncate">
                {file.fileName}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  file.step === "error"
                    ? "bg-red-900/40 text-red-400"
                    : file.step === "done"
                    ? "bg-green-900/40 text-green-400"
                    : "bg-blue-900/40 text-blue-400"
                }`}
              >
                {STEP_LABELS[file.step]}
              </span>
            </div>

            {file.error && (
              <p className="text-xs text-red-400 mb-2">{file.error}</p>
            )}

            <div className="flex items-center gap-1.5">
              {STEP_ORDER.map((step, i) => (
                <StepDot
                  key={step}
                  active={file.step === step}
                  complete={currentIdx > i || file.step === "done"}
                  error={file.step === "error"}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
