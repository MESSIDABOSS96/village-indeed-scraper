import schemaConfig from "@config/schema.json";
import enumsConfig from "@config/enums.json";
import rulesConfig from "@config/rules.json";
import type { ColumnDef, FieldKey } from "./types";

export const COLUMNS: ColumnDef[] = schemaConfig.columns as ColumnDef[];

export const COLUMN_ORDER: FieldKey[] = COLUMNS.map((c) => c.key);

export const ENUMS: Record<string, string[]> = enumsConfig;

export const CONSTANTS: Record<string, string> = rulesConfig.constants;

export const FALLBACKS: Record<string, string> = rulesConfig.fallbacks;

export const CRITICAL_ERRORS: string[] = rulesConfig.critical.errors;
export const CRITICAL_WARNINGS: string[] = rulesConfig.critical.warnings;

export const ENUM_FIELDS: FieldKey[] = COLUMNS
  .filter((c) => c.type === "dropdown" || c.type === "multi-checkbox")
  .map((c) => c.key);

export const CONSTANT_FIELDS: FieldKey[] = COLUMNS
  .filter((c) => c.type === "constant")
  .map((c) => c.key);

export const US_STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
};

export const VALID_STATE_ABBRS = new Set(Object.values(US_STATES));
