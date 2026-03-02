"use client";

import { useState } from "react";
import type { IssueSeverity } from "@/lib/types";

const SEVERITY_STYLES: Record<IssueSeverity, { bg: string; text: string; border: string }> = {
  error: { bg: "bg-red-900/40", text: "text-red-400", border: "border-red-800" },
  warning: { bg: "bg-yellow-900/40", text: "text-yellow-400", border: "border-yellow-800" },
  info: { bg: "bg-blue-900/40", text: "text-blue-400", border: "border-blue-800" },
};

const SEVERITY_ICONS: Record<IssueSeverity, string> = {
  error: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z",
  warning: "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z",
  info: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z",
};

interface IssueFlagProps {
  severity: IssueSeverity;
  message: string;
}

export default function IssueFlag({ severity, message }: IssueFlagProps) {
  const [expanded, setExpanded] = useState(false);
  const styles = SEVERITY_STYLES[severity];

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left flex items-start gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${styles.bg} ${styles.text} ${styles.border} border cursor-pointer`}
    >
      <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d={SEVERITY_ICONS[severity]} clipRule="evenodd" />
      </svg>
      <span className={expanded ? "" : "truncate"}>
        {message}
      </span>
    </button>
  );
}
