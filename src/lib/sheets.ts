import { google } from "googleapis";
import { COLUMNS } from "./constants";
import type { ResumeRecord, FieldKey } from "./types";

function getAuth() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");
  }

  const sanitized = serviceAccountJson.replace(/\n/g, "\\n");
  const credentials = JSON.parse(sanitized);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/** Map from column label → field key (e.g. "First Name" → "firstName") */
const LABEL_TO_KEY = new Map<string, FieldKey>(
  COLUMNS.map((c) => [c.label, c.key])
);

export async function appendToSheet(
  records: ResumeRecord[]
): Promise<{ updatedRange: string; updatedRows: number }> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = (process.env.GOOGLE_SHEET_RANGE || "Sheet1!A:W").split("!")[0];

  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID environment variable is not set");
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Read header row to determine column order in the actual sheet
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!1:1`,
  });

  const sheetHeaders: string[] = headerRes.data.values?.[0] ?? [];
  if (sheetHeaders.length === 0) {
    throw new Error("Sheet header row is empty — cannot map columns");
  }

  // Build mapping: sheet column index → field key
  const colCount = sheetHeaders.length;
  const indexToKey: (FieldKey | null)[] = sheetHeaders.map((header) =>
    LABEL_TO_KEY.get(header.trim()) ?? null
  );

  // Build rows aligned to the sheet's column order
  const rows = records.map((record) => {
    const row = new Array(colCount).fill("");
    for (let i = 0; i < colCount; i++) {
      const key = indexToKey[i];
      if (key) {
        row[i] = record[key] ?? "";
      }
    }
    return row;
  });

  const range = `${sheetName}!A:${String.fromCharCode(64 + colCount)}`;

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows,
    },
  });

  return {
    updatedRange: response.data.updates?.updatedRange ?? "",
    updatedRows: response.data.updates?.updatedRows ?? 0,
  };
}
