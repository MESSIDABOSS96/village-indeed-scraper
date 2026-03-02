"use client";

import Header from "@/components/Header";
import UploadZone from "@/components/UploadZone";
import ProcessingStatus from "@/components/ProcessingStatus";
import ReviewTable from "@/components/ReviewTable";
import SaveButton from "@/components/SaveButton";
import { useResumeProcessor } from "@/hooks/useResumeProcessor";

export default function Home() {
  const {
    phase,
    files,
    saving,
    saveResult,
    processFiles,
    updateField,
    saveToSheet,
    reset,
  } = useResumeProcessor();

  const recordCount = files.filter((f) => f.record).length;

  if (phase === "upload") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 -mt-24">
        <Header onReset={phase !== "upload" ? reset : undefined} />
        <div className="w-full mt-6">
          <UploadZone onProcess={processFiles} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header onReset={phase !== "upload" ? reset : undefined} />

      <main className="flex-1 px-6 py-8">
        <div className="max-w-[1800px] mx-auto">
          {phase === "processing" && (
            <div className="space-y-4">
              <ProcessingStatus files={files} />
              <div className="flex justify-center">
                <button
                  onClick={reset}
                  className="text-sm px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {phase === "review" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-100">
                    Review Extracted Data
                  </h2>
                  <button
                    onClick={reset}
                    className="text-sm px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    Start Over
                  </button>
                </div>
                <SaveButton
                  onSave={() => saveToSheet()}
                  saving={saving}
                  result={saveResult}
                  recordCount={recordCount}
                />
              </div>

              <ReviewTable
                files={files}
                onFieldChange={updateField}
                saving={saving}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
