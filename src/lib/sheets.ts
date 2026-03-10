import { google } from "googleapis";
import { COLUMNS } from "./constants";
import type { ResumeRecord, FieldKey, InboxItem, InboxStatus, Disposition } from "./types";

function getAuth() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    // Vercel may expand \n to actual newlines, breaking JSON parsing
    const sanitized = serviceAccountJson.replace(/\n/g, "\\n");
    credentials = JSON.parse(sanitized);
  }

  // Ensure the private key has real newline characters
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/** Map from column label → field key (e.g. "First Name" → "firstName"), excluding UI-only fields */
const LABEL_TO_KEY = new Map<string, FieldKey>(
  COLUMNS.filter((c) => c.export !== false).map((c) => [c.label, c.key])
);

export async function appendToSheet(
  records: ResumeRecord[]
): Promise<{ updatedRange: string; updatedRows: number; skipped: number }> {
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

  // Deduplicate by email: read existing data rows and collect emails
  const emailColIndex = sheetHeaders.findIndex(
    (h) => h.trim().toLowerCase() === "email"
  );

  let existingEmails = new Set<string>();
  if (emailColIndex !== -1) {
    const colLetter = String.fromCharCode(65 + emailColIndex);
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!${colLetter}2:${colLetter}`,
    });
    const emailRows = dataRes.data.values ?? [];
    existingEmails = new Set(
      emailRows
        .map((r) => (r[0] ?? "").toString().trim().toLowerCase())
        .filter(Boolean)
    );
  }

  // Filter out records whose email already exists in the sheet
  const newRecords = records.filter((r) => {
    const email = (r.email ?? "").trim().toLowerCase();
    return !email || !existingEmails.has(email);
  });
  const skipped = records.length - newRecords.length;

  if (newRecords.length === 0) {
    return { updatedRange: "", updatedRows: 0, skipped };
  }

  // Build rows aligned to the sheet's column order
  const rows = newRecords.map((record) => {
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
    skipped,
  };
}

// ─── Inbox Sheet CRUD ───────────────────────────────────────────────

const INBOX_SHEET = "Inbox";

// Column order in the Inbox sheet tab
const INBOX_COLUMNS = [
  "id",
  "indeedApplicationId",
  "status",
  "receivedAt",
  "applicantName",
  "resumeFileName",
  "jobTitle",
  "resumeText",
  "processedRecord",
  "issues",
  "confidenceNotes",
  "errorMessage",
  "disposition",
  "interviewAvailability",
] as const;

function inboxItemToRow(item: InboxItem): string[] {
  return INBOX_COLUMNS.map((col) => {
    const val = item[col as keyof InboxItem];
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

function rowToInboxItem(row: string[]): InboxItem {
  const get = (i: number) => row[i] ?? "";
  const parseJson = <T>(s: string, fallback: T): T => {
    if (!s) return fallback;
    try { return JSON.parse(s); } catch { return fallback; }
  };

  return {
    id: get(0),
    indeedApplicationId: get(1),
    status: (get(2) || "new") as InboxStatus,
    receivedAt: get(3),
    applicantName: get(4),
    resumeFileName: get(5),
    jobTitle: get(6),
    resumeText: get(7) || undefined,
    processedRecord: parseJson<ResumeRecord | undefined>(get(8), undefined),
    issues: parseJson(get(9), undefined),
    confidenceNotes: parseJson(get(10), undefined),
    errorMessage: get(11) || undefined,
    disposition: (get(12) || "New") as Disposition,
    interviewAvailability: get(13) || undefined,
  };
}

async function getInboxSheet() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, sheetId };
}

let inboxSheetVerified = false;

export async function ensureInboxSheet(): Promise<void> {
  if (inboxSheetVerified) return;
  const { sheets, sheetId } = await getInboxSheet();

  // Check if Inbox tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === INBOX_SHEET
  );

  if (!exists) {
    // Create the Inbox tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: INBOX_SHEET } } }],
      },
    });
  }

  // Verify header row exists and is correct
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${INBOX_SHEET}!A1:N1`,
  });
  const headerRow = headerRes.data.values?.[0] ?? [];
  const expectedHeaders = INBOX_COLUMNS.map(String);

  if (
    headerRow.length !== expectedHeaders.length ||
    !expectedHeaders.every((h, i) => headerRow[i] === h)
  ) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${INBOX_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [expectedHeaders],
      },
    });
  }

  inboxSheetVerified = true;
}

export async function appendToInbox(item: InboxItem): Promise<void> {
  await ensureInboxSheet();
  const { sheets, sheetId } = await getInboxSheet();

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${INBOX_SHEET}!A:N`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [inboxItemToRow(item)] },
  });
}

export async function getInboxItems(): Promise<InboxItem[]> {
  await ensureInboxSheet();
  const { sheets, sheetId } = await getInboxSheet();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${INBOX_SHEET}!A2:N`,
  });

  const rows = res.data.values ?? [];
  return rows.map(rowToInboxItem);
}

function normalizeIndeedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id");
    if (id) {
      return `https://employers.indeed.com/candidates/view?id=${id}`;
    }
  } catch {}
  return url;
}

export async function findInboxByIndeedId(
  indeedApplicationId: string
): Promise<InboxItem | null> {
  const items = await getInboxItems();
  const normalizedSearch = normalizeIndeedUrl(indeedApplicationId);
  return items.find((i) => normalizeIndeedUrl(i.indeedApplicationId) === normalizedSearch) ?? null;
}

export async function updateInboxItem(
  id: string,
  updates: Partial<InboxItem>
): Promise<void> {
  await ensureInboxSheet();
  const { sheets, sheetId } = await getInboxSheet();

  // Read all rows to find the target
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${INBOX_SHEET}!A2:N`,
  });

  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((r) => r[0] === id);
  if (rowIndex === -1) throw new Error(`Inbox item ${id} not found`);

  const existing = rowToInboxItem(rows[rowIndex]);
  const merged = { ...existing, ...updates };
  const sheetRow = rowIndex + 2; // 1-indexed + header

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${INBOX_SHEET}!A${sheetRow}:N${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [inboxItemToRow(merged)] },
  });
}

export async function deduplicateInbox(): Promise<{ removed: number }> {
  await ensureInboxSheet();
  const { sheets, sheetId } = await getInboxSheet();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${INBOX_SHEET}!A2:N`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return { removed: 0 };

  // Group rows by normalized Indeed URL, then by name as fallback
  const seen = new Map<string, number>(); // key → first row index
  const rowsToDelete: number[] = []; // 0-indexed row positions in the data

  for (let i = 0; i < rows.length; i++) {
    const item = rowToInboxItem(rows[i]);
    const urlKey = normalizeIndeedUrl(item.indeedApplicationId);
    const nameKey = item.applicantName.trim().toLowerCase();
    const dedupKey = urlKey || nameKey;

    if (!dedupKey) continue;

    const existingIdx = seen.get(dedupKey);
    if (existingIdx !== undefined) {
      // Keep the one with status="processed", or the first one
      const existingItem = rowToInboxItem(rows[existingIdx]);
      if (item.status === "processed" && existingItem.status !== "processed") {
        // Replace: delete the old one, keep this one
        rowsToDelete.push(existingIdx);
        seen.set(dedupKey, i);
      } else {
        // Delete this duplicate
        rowsToDelete.push(i);
      }
    } else {
      seen.set(dedupKey, i);
      // Also register the name key for name-based dedup
      if (nameKey && dedupKey !== nameKey && !seen.has(nameKey)) {
        seen.set(nameKey, i);
      }
    }
  }

  if (rowsToDelete.length === 0) return { removed: 0 };

  // Delete rows from bottom to top to preserve indices
  const sortedDesc = [...rowsToDelete].sort((a, b) => b - a);

  // Get the Inbox sheet's numeric ID for batchUpdate
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const inboxSheet = meta.data.sheets?.find(
    (s) => s.properties?.title === INBOX_SHEET
  );
  const inboxSheetId = inboxSheet?.properties?.sheetId ?? 0;

  const requests = sortedDesc.map((dataRowIdx) => ({
    deleteDimension: {
      range: {
        sheetId: inboxSheetId,
        dimension: "ROWS" as const,
        startIndex: dataRowIdx + 1, // +1 for header row
        endIndex: dataRowIdx + 2,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests },
  });

  return { removed: rowsToDelete.length };
}
