import type { ResumeRecord } from "./types";

const HUBSPOT_BASE = "https://api.hubapi.com";

// --- Value transformation maps ---

const LIFECYCLE_STAGE_MAP: Record<string, string> = {
  "Lead": "lead",
  "Marketing Qualified Lead": "marketingqualifiedlead",
  "Sales Qualified Lead": "salesqualifiedlead",
  "Opportunity": "opportunity",
  "Customer": "customer",
  "Evangelist": "evangelist",
  "Subscriber": "subscriber",
  "Other": "other",
};

const LEAD_STATUS_MAP: Record<string, string> = {
  "1) New": "NEW",
  "2) Open": "OPEN",
  "3) In Progress": "IN_PROGRESS",
  "4) Open Deal": "OPEN_DEAL",
  "5) Unqualified": "UNQUALIFIED",
  "6) Attempted to Contact": "ATTEMPTED_TO_CONTACT",
  "7) Connected": "CONNECTED",
  "8) Bad Timing": "BAD_TIMING",
};

const SIGN_UP_SOURCE_MAP: Record<string, string> = {
  "Job Posting": "Job Posting - Indeed",
};

const CONTACT_TYPE_MAP: Record<string, string> = {
  "Caregiver": "Caregiver",
  "Provider - Independent": "Provider",
  "Provider - Business": "Provider - Business",
  "Partner": "Partner",
};

const CARE_SETTING_MAP: Record<string, string> = {
  "In-Community (School, Park, Other Location)": "School",
};

const SEGMENT_MAP: Record<string, string> = {
  "Gig-Based Clinician": "Employee / Gig Work",
  "Solo Established Practitioner": "Solo",
  "Emerging SMB Practice (2-5)": "SMB / Emerging",
  "Scaled Practice (5-15)": "Mid Market / Scaling",
  "Large Practice (15+)": "Enterprise / Large Center",
  "Solo Aspiring Practitioner": "Solo Aspiring Practitioner",
};

const LANGUAGE_MAP: Record<string, string> = {
  "Afrikaans": "af", "Albanian": "sq", "Amharic": "am", "Arabic": "ar",
  "Armenian": "hy", "Azerbaijani": "az", "Basque": "eu", "Belarusian": "be",
  "Bengali": "bn", "Bosnian": "bs", "Bulgarian": "bg", "Burmese": "my",
  "Catalan": "ca", "Cebuano": "ceb", "Chinese": "zh",
  "Chinese (Simplified)": "zh-Hans", "Chinese (Traditional)": "zh-Hant",
  "Croatian": "hr", "Czech": "cs", "Danish": "da", "Dutch": "nl",
  "English": "en", "Esperanto": "eo", "Estonian": "et", "Filipino": "fil",
  "Finnish": "fi", "French": "fr", "Galician": "gl", "Georgian": "ka",
  "German": "de", "Greek": "el", "Gujarati": "gu", "Haitian Creole": "ht",
  "Hausa": "ha", "Hawaiian": "haw", "Hebrew": "he", "Hindi": "hi",
  "Hmong": "hmn", "Hungarian": "hu", "Icelandic": "is", "Igbo": "ig",
  "Indonesian": "id", "Irish": "ga", "Italian": "it", "Japanese": "ja",
  "Javanese": "jv", "Kannada": "kn", "Kazakh": "kk", "Khmer": "km",
  "Kinyarwanda": "rw", "Korean": "ko", "Kurdish": "ku", "Kyrgyz": "ky",
  "Lao": "lo", "Latin": "la", "Latvian": "lv", "Lithuanian": "lt",
  "Luxembourgish": "lb", "Macedonian": "mk", "Malagasy": "mg", "Malay": "ms",
  "Malayalam": "ml", "Maltese": "mt", "Maori": "mi", "Marathi": "mr",
  "Mongolian": "mn", "Nepali": "ne", "Norwegian": "no", "Odia": "or",
  "Pashto": "ps", "Persian": "fa", "Polish": "pl", "Portuguese": "pt",
  "Punjabi": "pa", "Romanian": "ro", "Russian": "ru", "Samoan": "sm",
  "Scots Gaelic": "gd", "Serbian": "sr", "Sesotho": "st", "Shona": "sn",
  "Sindhi": "sd", "Sinhala": "si", "Slovak": "sk", "Slovenian": "sl",
  "Somali": "so", "Spanish": "es", "Sundanese": "su", "Swahili": "sw",
  "Swedish": "sv", "Tajik": "tg", "Tamil": "ta", "Tatar": "tt",
  "Telugu": "te", "Thai": "th", "Turkish": "tr", "Turkmen": "tk",
  "Ukrainian": "uk", "Urdu": "ur", "Uyghur": "ug", "Uzbek": "uz",
  "Vietnamese": "vi", "Welsh": "cy", "Xhosa": "xh", "Yiddish": "yi",
  "Yoruba": "yo", "Zulu": "zu",
};

/**
 * Transform a display label to the HubSpot internal enum value.
 * Returns null if the value can't be mapped (so the property should be skipped).
 */
function transformValue(
  hubspotKey: string,
  value: string
): string | null {
  switch (hubspotKey) {
    case "lifecyclestage": {
      const mapped = LIFECYCLE_STAGE_MAP[value];
      return mapped ?? value.toLowerCase();
    }
    case "hs_lead_status": {
      const mapped = LEAD_STATUS_MAP[value];
      return mapped ?? null;
    }
    case "sign_up_source": {
      return SIGN_UP_SOURCE_MAP[value] ?? value;
    }
    case "contact_type": {
      return CONTACT_TYPE_MAP[value] ?? null;
    }
    case "care_setting": {
      return CARE_SETTING_MAP[value] ?? value;
    }
    case "segment": {
      return SEGMENT_MAP[value] ?? null;
    }
    case "languages_spoken": {
      // Semicolon-separated multi-value: map each part individually
      const parts = value.split(";").map((s) => s.trim()).filter(Boolean);
      const mapped = parts
        .map((lang) => LANGUAGE_MAP[lang] ?? null)
        .filter((code): code is string => code !== null);
      return mapped.length > 0 ? mapped.join(";") : null;
    }
    default:
      return value;
  }
}

// In-memory cache for owner ID lookup
let cachedOwnerId: string | null = null;

function getToken(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN || null;
}

function hubspotHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Look up a HubSpot owner ID by name. Caches the result in-memory.
 */
export async function lookupOwnerId(
  ownerName: string
): Promise<string | null> {
  if (cachedOwnerId) return cachedOwnerId;

  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/owners?limit=100`, {
      headers: hubspotHeaders(token),
    });
    if (!res.ok) {
      console.error("HubSpot owners lookup failed:", res.status);
      return null;
    }
    const data = await res.json();
    const nameParts = ownerName.toLowerCase().split(" ");
    const owner = data.results?.find(
      (o: { firstName: string; lastName: string }) =>
        o.firstName?.toLowerCase() === nameParts[0] &&
        o.lastName?.toLowerCase() === nameParts[nameParts.length - 1]
    );
    if (owner) {
      cachedOwnerId = owner.id;
      return owner.id;
    }
    console.warn(`HubSpot owner "${ownerName}" not found`);
    return null;
  } catch (err) {
    console.error("HubSpot owner lookup error:", err);
    return null;
  }
}

/**
 * Map a ResumeRecord to HubSpot contact properties.
 */
async function mapToHubSpotProperties(
  record: ResumeRecord,
  ownerName: string
): Promise<Record<string, string>> {
  const props: Record<string, string> = {};

  const mapping: [keyof ResumeRecord, string][] = [
    ["firstName", "firstname"],
    ["lastName", "lastname"],
    ["villageRole", "village_role"],
    ["linkedinUrl", "hs_linkedin_url"],
    ["email", "email"],
    ["phoneNumber", "phone"],
    ["leadStatus", "hs_lead_status"],
    ["leadScore", "contact_score"],
    ["lifecycleStage", "lifecyclestage"],
    ["signUpSource", "sign_up_source"],
    ["signUpSource2", "sign_up_source_2"],
    ["city", "city"],
    ["stateRegion", "state"],
    ["postalCode", "zip"],
    ["serviceCities", "service_cities"],
    ["segment", "segment"],
    ["specialties", "specialties"],
    ["agesServed", "ages_served"],
    ["careSetting", "care_setting"],
    ["languagesSpoken", "languages_spoken"],
    ["contactType", "contact_type"],
    ["hdyhauSource", "hdyhau_source"],
    ["hdyhauSourceDetail", "hdyhau_source_detail"],
    ["licenseType", "license_type"],
    ["licenseNumber", "license__"],
    ["licenseState", "license_state"],
    ["yearsOutOfSchool", "years_out_of_school"],
  ];

  for (const [recordKey, hubspotKey] of mapping) {
    const value = record[recordKey];
    if (value) {
      const transformed = transformValue(hubspotKey, value);
      if (transformed !== null) {
        props[hubspotKey] = transformed;
      }
    }
  }

  // Look up owner ID
  if (ownerName) {
    const ownerId = await lookupOwnerId(ownerName);
    if (ownerId) {
      props.hubspot_owner_id = ownerId;
    }
  }

  return props;
}

/**
 * Try to update a contact by email. If not found (404), create it instead.
 * Returns "updated" | "created" | "failed".
 */
async function upsertContact(
  token: string,
  email: string,
  properties: Record<string, string>
): Promise<"updated" | "created" | "failed"> {
  // Try update first
  const updateRes = await fetch(
    `${HUBSPOT_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
    {
      method: "PATCH",
      headers: hubspotHeaders(token),
      body: JSON.stringify({ properties }),
    }
  );

  if (updateRes.ok) return "updated";

  // If contact not found, create it
  if (updateRes.status === 404) {
    const createRes = await fetch(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts`,
      {
        method: "POST",
        headers: hubspotHeaders(token),
        body: JSON.stringify({ properties }),
      }
    );
    if (createRes.ok) return "created";

    const err = await createRes.text();
    console.error(`HubSpot create failed for ${email}:`, err);
    return "failed";
  }

  const err = await updateRes.text();
  console.error(`HubSpot update failed for ${email}:`, err);
  return "failed";
}

export interface HubSpotPushResult {
  success: boolean;
  updated: number;
  created: number;
  failed: number;
  message: string;
}

/**
 * Push an array of ResumeRecords to HubSpot.
 * Updates existing contacts by email; creates new ones if not found.
 */
export async function pushContactsToHubSpot(
  records: ResumeRecord[],
  ownerName: string
): Promise<HubSpotPushResult> {
  const token = getToken();
  if (!token) {
    return {
      success: false,
      updated: 0,
      created: 0,
      failed: 0,
      message: "HUBSPOT_ACCESS_TOKEN not configured",
    };
  }

  let updated = 0;
  let created = 0;
  let failed = 0;

  for (const record of records) {
    if (!record.email) {
      failed++;
      console.warn("Skipping record with no email:", record.id);
      continue;
    }

    try {
      const properties = await mapToHubSpotProperties(record, ownerName);
      const result = await upsertContact(token, record.email, properties);
      if (result === "updated") updated++;
      else if (result === "created") created++;
      else failed++;
    } catch (err) {
      console.error(`HubSpot push error for ${record.email}:`, err);
      failed++;
    }
  }

  const parts: string[] = [];
  if (updated > 0) parts.push(`updated ${updated}`);
  if (created > 0) parts.push(`created ${created}`);
  if (failed > 0) parts.push(`${failed} failed`);

  return {
    success: failed === 0,
    updated,
    created,
    failed,
    message: `HubSpot: ${parts.join(", ")} contact(s)`,
  };
}
