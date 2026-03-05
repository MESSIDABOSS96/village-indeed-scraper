"use client";

import { useState } from "react";
import Header from "@/components/Header";
import UploadZone from "@/components/UploadZone";
import ProcessingStatus from "@/components/ProcessingStatus";
import ReviewTable from "@/components/ReviewTable";
import SaveButton from "@/components/SaveButton";
import InboxView from "@/components/InboxView";
import { useResumeProcessor } from "@/hooks/useResumeProcessor";
import { useIndeedInbox } from "@/hooks/useIndeedInbox";

type Tab = "upload" | "inbox";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");

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

  const inbox = useIndeedInbox(activeTab === "inbox");

  const recordCount = files.filter((f) => f.record).length;

  const handleReset = () => {
    reset();
    // Stay on current tab
  };

  // Upload tab in initial upload phase
  if (activeTab === "upload" && phase === "upload") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 -mt-24">
        <Header />
        <TabSwitcher
          activeTab={activeTab}
          onTabChange={setActiveTab}
          inboxCount={inbox.newCount}
        />
        <div className="w-full mt-6">
          <UploadZone onProcess={processFiles} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header onReset={handleReset} />
      <TabSwitcher
        activeTab={activeTab}
        onTabChange={setActiveTab}
        inboxCount={inbox.newCount}
      />

      <main className="flex-1 px-6 py-8">
        <div className="max-w-[1800px] mx-auto">
          {activeTab === "upload" && (
            <>
              {phase === "processing" && (
                <div className="space-y-4">
                  <ProcessingStatus files={files} />
                  <div className="flex justify-center">
                    <button
                      onClick={handleReset}
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
                        onClick={handleReset}
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
                      files={files}
                    />
                  </div>

                  <ReviewTable
                    files={files}
                    onFieldChange={updateField}
                    saving={saving}
                  />
                </div>
              )}
            </>
          )}

          {activeTab === "inbox" && (
            <InboxView
              items={inbox.items}
              loading={inbox.loading}
              error={inbox.error}
              saving={inbox.saving}
              saveResult={inbox.saveResult}
              onRetry={inbox.retryItem}
              onRefresh={inbox.fetchInbox}
              onDispositionChange={inbox.updateDisposition}
              onFieldChange={inbox.updateField}
              onSave={() => inbox.saveToSheet()}
              toProcessingFiles={inbox.toProcessingFiles}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function TabSwitcher({
  activeTab,
  onTabChange,
  inboxCount,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  inboxCount: number;
}) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex rounded-lg bg-gray-800/50 p-1 gap-1">
        <button
          onClick={() => onTabChange("upload")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "upload"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Upload
        </button>
        <button
          onClick={() => onTabChange("inbox")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "inbox"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Inbox
          {inboxCount > 0 && (
            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {inboxCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
