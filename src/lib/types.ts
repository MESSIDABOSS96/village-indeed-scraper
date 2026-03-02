export interface ResumeRecord {
  id: string;
  firstName: string;
  lastName: string;
  villageRole: string;
  contactOwner: string;
  linkedinUrl: string;
  email: string;
  phoneNumber: string;
  leadStatus: string;
  leadScore: string;
  lifecycleStage: string;
  signUpSource: string;
  signUpSource2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  segment: string;
  specialties: string;
  agesServed: string;
  careSetting: string;
  languagesSpoken: string;
  licenseType: string;
  licenseNumber: string;
  licenseState: string;
}

export type FieldKey = keyof Omit<ResumeRecord, "id">;

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceMap {
  [field: string]: ConfidenceLevel;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface FieldIssue {
  field: FieldKey;
  severity: IssueSeverity;
  message: string;
}

export type ProcessingStep =
  | "pending"
  | "extracting-text"
  | "ai-stage-1"
  | "ai-stage-2"
  | "linkedin-lookup"
  | "validating"
  | "done"
  | "error";

export interface ProcessingFile {
  id: string;
  fileName: string;
  step: ProcessingStep;
  record?: ResumeRecord;
  issues?: FieldIssue[];
  confidenceNotes?: ConfidenceMap;
  rawText?: string;
  error?: string;
}

export interface Stage1Result {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  linkedinUrl: string | null;
  licenseType: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  specialties: string[];
  agesServed: string | null;
  careSettings: string[];
  languages: string[];
  workExperience: string | null;
}

export interface Stage2Result {
  firstName: string;
  lastName: string;
  villageRole: string;
  email: string;
  phoneNumber: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  linkedinUrl: string;
  segment: string;
  specialties: string;
  agesServed: string;
  careSetting: string;
  languagesSpoken: string;
  licenseType: string;
  licenseNumber: string;
  licenseState: string;
  confidence: ConfidenceMap;
}

export interface ColumnDef {
  key: FieldKey;
  label: string;
  type: "text" | "dropdown" | "multi-checkbox" | "constant";
  order: number;
}

export interface ParseResult {
  fileName: string;
  text?: string;
  error?: string;
}

export interface ExtractResult {
  record: ResumeRecord;
  issues: FieldIssue[];
  confidenceNotes: ConfidenceMap;
  rawText: string;
  status: "success" | "error";
  error?: string;
}

export interface LinkedInLookup {
  id: string;
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
}
