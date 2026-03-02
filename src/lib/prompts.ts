import { ENUMS } from "./constants";

export function buildStage1Prompt(resumeText: string): string {
  return `You are an expert resume parser. Extract structured data from the following resume text.

IMPORTANT RULES:
- For city, stateRegion, and postalCode: extract the applicant's HOME/residential address, NOT their workplace address. If multiple addresses appear, prefer the one labeled as home, personal, or residential.
- For stateRegion: use the full state name (e.g., "California", not "CA"). It will be normalized later.
- Return null for any field you cannot find in the resume.
- For specialties: return an array of free-text strings describing their clinical specialties, areas of expertise, or conditions they treat.
- For careSettings: return an array of settings where they've worked (e.g., "home health", "outpatient clinic", "school", "telehealth").
- For languages: return an array of languages they speak. Only include languages explicitly mentioned.
- For workExperience: provide a brief summary of their most recent 1-2 roles including employer name, title, and setting.

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):

{
  "firstName": string | null,
  "lastName": string | null,
  "email": string | null,
  "phoneNumber": string | null,
  "city": string | null,
  "stateRegion": string | null,
  "postalCode": string | null,
  "linkedinUrl": string | null,
  "licenseType": string | null,
  "licenseNumber": string | null,
  "licenseState": string | null,
  "specialties": string[],
  "agesServed": string | null,
  "careSettings": string[],
  "languages": string[],
  "workExperience": string | null
}

RESUME TEXT:
${resumeText}`;
}

export function buildStage2Prompt(stage1Json: string): string {
  return `You are an expert at mapping extracted resume data to a specific HubSpot CRM schema. Given the raw extracted data below, normalize each field to match the allowed values exactly.

RULES:
1. For dropdown fields, you MUST select ONLY from the allowed values listed below, or leave the field as an empty string "" if no good match exists.
2. For the "specialties" field, select ALL matching values from the allowed list and return them as a SINGLE string with values separated by semicolons (e.g., "Autism Spectrum Disorder;ADHD;Speech Disorders"). Only include specialties that are clearly supported by the resume data.
3. For stateRegion and licenseState: convert to 2-letter US state abbreviations (e.g., "CA", "NY").
4. For villageRole: Most Indeed applicants are clinicians. Use your best judgment based on the resume. If the person is clearly a healthcare/therapy practitioner, use "Clinician". If they're looking to start a practice, consider "Aspiring Business Owner".
5. For segment: Infer from the resume. "Gig-Based Clinician" = works per-diem/contract. "Solo Aspiring Practitioner" = individual clinician not yet in private practice. "Solo Established Practitioner" = has their own solo practice. Use practice size clues for the group options.
6. For agesServed: "Pediatrics" if they work with children/adolescents, "Adults" if adult populations, "Seniors" if geriatric. Pick the primary population from their experience.
7. For careSetting: Pick the MOST RECENT or PRIMARY setting from their experience.
8. For languagesSpoken: Match to the closest allowed value. If no languages are mentioned in the resume, use "English".
9. For licenseType: Match their credentials to the closest allowed license type.
10. Return a "confidence" object with "high", "medium", or "low" for each inferred field (villageRole, segment, specialties, agesServed, careSetting, languagesSpoken, licenseType). Use "high" when the resume clearly supports the value, "medium" when it's a reasonable inference, and "low" when you're guessing or using a fallback.

ALLOWED VALUES FOR DROPDOWN FIELDS:

villageRole: ${JSON.stringify(ENUMS.villageRole)}

segment: ${JSON.stringify(ENUMS.segment)}

specialties (select all that apply, semicolon-separated): ${JSON.stringify(ENUMS.specialties)}

agesServed: ${JSON.stringify(ENUMS.agesServed)}

careSetting: ${JSON.stringify(ENUMS.careSetting)}

languagesSpoken: ${JSON.stringify(ENUMS.languagesSpoken)}

licenseType: ${JSON.stringify(ENUMS.licenseType)}

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):

{
  "firstName": string,
  "lastName": string,
  "villageRole": string,
  "email": string,
  "phoneNumber": string,
  "city": string,
  "stateRegion": string,
  "postalCode": string,
  "linkedinUrl": string,
  "segment": string,
  "specialties": string,
  "agesServed": string,
  "careSetting": string,
  "languagesSpoken": string,
  "licenseType": string,
  "licenseNumber": string,
  "licenseState": string,
  "confidence": {
    "villageRole": "high" | "medium" | "low",
    "segment": "high" | "medium" | "low",
    "specialties": "high" | "medium" | "low",
    "agesServed": "high" | "medium" | "low",
    "careSetting": "high" | "medium" | "low",
    "languagesSpoken": "high" | "medium" | "low",
    "licenseType": "high" | "medium" | "low"
  }
}

RAW EXTRACTED DATA:
${stage1Json}`;
}
