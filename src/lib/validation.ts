import { v4 as uuidv4 } from "uuid";
import {
  CONSTANTS,
  ENUMS,
  CRITICAL_ERRORS,
  CRITICAL_WARNINGS,
  US_STATES,
  VALID_STATE_ABBRS,
} from "./constants";
import type {
  ResumeRecord,
  FieldIssue,
  ConfidenceMap,
  FieldKey,
  Stage2Result,
  Stage1Result,
} from "./types";

function normalizeState(value: string): { normalized: string; issue?: FieldIssue } {
  if (!value) return { normalized: "" };

  const trimmed = value.trim();

  // Already a valid 2-letter abbreviation
  if (trimmed.length === 2 && VALID_STATE_ABBRS.has(trimmed.toUpperCase())) {
    return { normalized: trimmed.toUpperCase() };
  }

  // Try full state name lookup (case-insensitive)
  const match = Object.entries(US_STATES).find(
    ([name]) => name.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) {
    return { normalized: match[1] };
  }

  // Invalid state
  return {
    normalized: trimmed,
    issue: {
      field: "stateRegion" as FieldKey,
      severity: "warning",
      message: `"${trimmed}" could not be normalized to a 2-letter state abbreviation`,
    },
  };
}

function validateEnum(field: FieldKey, value: string): { valid: boolean; issue?: FieldIssue } {
  if (!value) return { valid: true }; // Empty is OK (will be flagged elsewhere if critical)

  const allowed = ENUMS[field];
  if (!allowed) return { valid: true }; // No enum constraint

  if (allowed.includes(value)) {
    return { valid: true };
  }

  // Try case-insensitive match
  const ciMatch = allowed.find((opt) => opt.toLowerCase() === value.toLowerCase());
  if (ciMatch) {
    return { valid: true };
  }

  return {
    valid: false,
    issue: {
      field,
      severity: "warning",
      message: `"${value}" is not a valid option for ${field}`,
    },
  };
}

function validateSpecialties(value: string): { validated: string; issues: FieldIssue[] } {
  if (!value) return { validated: "", issues: [] };

  const allowed = new Set(ENUMS.specialties);
  const allowedLower = new Map(ENUMS.specialties.map((s) => [s.toLowerCase(), s]));
  const parts = value.split(";").map((s) => s.trim()).filter(Boolean);
  const valid: string[] = [];
  const issues: FieldIssue[] = [];

  for (const part of parts) {
    if (allowed.has(part)) {
      valid.push(part);
    } else {
      const ciMatch = allowedLower.get(part.toLowerCase());
      if (ciMatch) {
        valid.push(ciMatch);
      } else {
        issues.push({
          field: "specialties",
          severity: "info",
          message: `Specialty "${part}" was removed (not in allowed list)`,
        });
      }
    }
  }

  return { validated: valid.join(";"), issues };
}

export function validateAndNormalize(
  stage2: Stage2Result,
  stage1?: Stage1Result
): { record: ResumeRecord; issues: FieldIssue[]; confidenceNotes: ConfidenceMap } {
  const issues: FieldIssue[] = [];
  const confidenceNotes: ConfidenceMap = stage2.confidence || {};

  // Start building record
  const record: ResumeRecord = {
    id: uuidv4(),
    firstName: stage2.firstName || "",
    lastName: stage2.lastName || "",
    villageRole: stage2.villageRole || "",
    contactOwner: "",
    linkedinUrl: stage2.linkedinUrl || "",
    email: stage2.email || "",
    phoneNumber: stage2.phoneNumber || "",
    leadStatus: "",
    leadScore: "",
    lifecycleStage: "",
    signUpSource: "",
    signUpSource2: "",
    city: stage2.city || "",
    stateRegion: stage2.stateRegion || "",
    postalCode: stage2.postalCode || "",
    segment: stage2.segment || "",
    specialties: stage2.specialties || "",
    agesServed: stage2.agesServed || "",
    careSetting: stage2.careSetting || "",
    languagesSpoken: stage2.languagesSpoken || "",
    licenseType: stage2.licenseType || "",
    licenseNumber: stage2.licenseNumber || "",
    licenseState: stage2.licenseState || "",
    contactType: "",
    hdyhauSource: "",
    hdyhauSourceDetail: "",
    sessionPreference: "",
    yearsOutOfSchool: stage1?.yearsOutOfSchool ?? "",
  };

  // 1. Force constants
  record.contactOwner = CONSTANTS.contactOwner;
  record.leadStatus = CONSTANTS.leadStatus;
  record.leadScore = CONSTANTS.leadScore;
  record.lifecycleStage = CONSTANTS.lifecycleStage;
  record.signUpSource = CONSTANTS.signUpSource;
  record.signUpSource2 = CONSTANTS.signUpSource2;
  record.contactType = CONSTANTS.contactType;
  record.hdyhauSource = CONSTANTS.hdyhauSource;
  record.hdyhauSourceDetail = CONSTANTS.hdyhauSourceDetail;

  // 2. State normalization
  const stateResult = normalizeState(record.stateRegion);
  record.stateRegion = stateResult.normalized;
  if (stateResult.issue) issues.push(stateResult.issue);

  const licStateResult = normalizeState(record.licenseState);
  record.licenseState = licStateResult.normalized;
  if (licStateResult.issue) {
    issues.push({ ...licStateResult.issue, field: "licenseState" });
  }

  // 3. Enum validation for dropdown fields
  const enumFieldsToValidate: FieldKey[] = [
    "villageRole",
    "segment",
    "agesServed",
    "careSetting",
    "languagesSpoken",
    "licenseType",
  ];

  for (const field of enumFieldsToValidate) {
    const val = record[field];
    const result = validateEnum(field, val);
    if (!result.valid) {
      record[field] = "";
      if (result.issue) issues.push(result.issue);
    } else if (val) {
      // Fix case if needed
      const allowed = ENUMS[field];
      if (allowed) {
        const ciMatch = allowed.find((opt) => opt.toLowerCase() === val.toLowerCase());
        if (ciMatch) record[field] = ciMatch;
      }
    }
  }

  // 4. Specialties validation
  const specResult = validateSpecialties(record.specialties);
  record.specialties = specResult.validated;
  issues.push(...specResult.issues);

  // 5. Critical checks
  for (const field of CRITICAL_ERRORS) {
    if (!record[field as FieldKey]) {
      issues.push({
        field: field as FieldKey,
        severity: "error",
        message: `${field} is missing (critical field)`,
      });
    }
  }

  for (const field of CRITICAL_WARNINGS) {
    if (!record[field as FieldKey]) {
      issues.push({
        field: field as FieldKey,
        severity: "warning",
        message: `${field} is missing`,
      });
    }
  }

  // 6. Confidence-based flagging
  for (const [field, level] of Object.entries(confidenceNotes)) {
    if (level === "medium" || level === "low") {
      const existing = issues.find(
        (i) => i.field === field && i.severity === "warning"
      );
      if (!existing) {
        issues.push({
          field: field as FieldKey,
          severity: level === "low" ? "warning" : "info",
          message: `AI confidence: ${level} — review recommended`,
        });
      }
    }
  }

  return { record, issues, confidenceNotes };
}
