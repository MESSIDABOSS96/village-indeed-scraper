"use client";

import { useState, useRef, useEffect } from "react";
import type { ColumnDef, FieldIssue, FieldKey } from "@/lib/types";
import { ENUMS } from "@/lib/constants";
import IssueFlag from "./IssueFlag";

interface FieldCellProps {
  column: ColumnDef;
  value: string;
  issues: FieldIssue[];
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const UI_ONLY_REQUIRED: Set<string> = new Set(["sessionPreference"]);

function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: Set<string>;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) {
      next.delete(opt);
    } else {
      next.add(opt);
    }
    onChange(Array.from(next));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left text-xs px-2 py-1 border border-gray-700 rounded bg-gray-800 text-gray-300 hover:border-gray-600 truncate"
      >
        {selected.size > 0 ? `${selected.size} selected` : "Select..."}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
          <div className="p-2 sticky top-0 bg-gray-800 border-b border-gray-700">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-gray-700 rounded bg-gray-900 text-gray-300"
              autoFocus
            />
          </div>
          {filtered.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="rounded text-blue-600"
              />
              <span className="text-xs text-gray-300">{opt}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-500 p-3">No matches</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FieldCell({
  column,
  value,
  issues,
  onChange,
  readOnly,
}: FieldCellProps) {
  const needsAttention = !value && UI_ONLY_REQUIRED.has(column.key);

  const cellBg = needsAttention
    ? "bg-purple-900/40 ring-1 ring-purple-500/50"
    : issues.some((i) => i.severity === "error")
    ? "bg-red-900/30"
    : issues.some((i) => i.severity === "warning")
    ? "bg-yellow-900/30"
    : issues.some((i) => i.severity === "info")
    ? "bg-blue-900/30"
    : "";

  return (
    <td className={`px-2 py-1.5 align-top ${cellBg} min-w-[140px] max-w-[200px]`}>
      <div className="space-y-1">
        {readOnly || column.type === "constant" ? (
          <span className="text-xs text-gray-400">{value}</span>
        ) : column.type === "multi-checkbox" ? (
          <MultiSelect
            options={ENUMS[column.key] || []}
            selected={new Set(value.split(";").filter(Boolean))}
            onChange={(vals) => onChange(vals.join(";"))}
          />
        ) : column.type === "dropdown" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-xs px-2 py-1 border border-gray-700 rounded bg-gray-800 text-gray-300 hover:border-gray-600"
          >
            <option value="">-- Select --</option>
            {(ENUMS[column.key] || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-xs px-2 py-1 border border-gray-700 rounded bg-gray-800 text-gray-300 hover:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        )}
        {!value && issues.length === 0 && column.type !== "constant" && (
          <IssueFlag severity="warning" message="Couldn't find, needs manual input" />
        )}
        {issues.map((issue, i) => (
          <IssueFlag key={i} severity={issue.severity} message={issue.message} />
        ))}
      </div>
    </td>
  );
}
