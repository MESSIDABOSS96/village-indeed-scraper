"use client";

interface SaveButtonProps {
  onSave: () => void;
  saving: boolean;
  result: { success: boolean; message: string } | null;
  recordCount: number;
}

export default function SaveButton({
  onSave,
  saving,
  result,
  recordCount,
}: SaveButtonProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onSave}
        disabled={saving || recordCount === 0}
        className="bg-green-600 text-white px-6 py-2.5 rounded-md font-medium hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Saving...
          </span>
        ) : (
          `Save All to Google Sheet (${recordCount})`
        )}
      </button>

      {result && (
        <span
          className={`text-sm font-medium ${
            result.success ? "text-green-600" : "text-red-600"
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
