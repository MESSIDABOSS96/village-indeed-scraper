import type { ResumeRecord } from "./types";

const SOCAL_CITIES = new Set([
  // Los Angeles area
  "los angeles", "la", "long beach", "santa monica", "pasadena", "burbank",
  "glendale", "torrance", "inglewood", "downey", "el monte", "west covina",
  "norwalk", "pomona", "compton", "south gate", "whittier", "alhambra",
  "hawthorne", "arcadia", "redondo beach", "lakewood", "bellflower",
  "manhattan beach", "hermosa beach", "culver city", "beverly hills",
  "west hollywood", "hollywood", "malibu", "calabasas", "encino",
  "sherman oaks", "woodland hills", "northridge", "van nuys", "chatsworth",
  "reseda", "tarzana", "studio city", "north hollywood", "sun valley",
  "pacoima", "sylmar", "san fernando", "santa clarita", "valencia",
  "palmdale", "lancaster", "azusa", "covina", "monrovia", "duarte",
  "glendora", "claremont", "la verne", "san dimas", "diamond bar",
  "rowland heights", "walnut", "hacienda heights", "la mirada",
  "cerritos", "artesia", "carson", "gardena", "lawndale", "el segundo",
  "marina del rey", "venice", "playa del rey", "westchester",
  // Orange County
  "anaheim", "irvine", "santa ana", "huntington beach", "garden grove",
  "orange", "fullerton", "costa mesa", "mission viejo", "lake forest",
  "newport beach", "laguna beach", "laguna niguel", "laguna hills",
  "aliso viejo", "dana point", "san clemente", "san juan capistrano",
  "tustin", "yorba linda", "brea", "placentia", "cypress", "buena park",
  "la habra", "westminster", "fountain valley", "seal beach", "los alamitos",
  "rancho santa margarita", "ladera ranch",
  // San Diego area
  "san diego", "chula vista", "oceanside", "escondido", "carlsbad",
  "el cajon", "vista", "san marcos", "encinitas", "national city",
  "la mesa", "santee", "poway", "solana beach", "del mar", "coronado",
  "imperial beach", "lemon grove", "spring valley", "la jolla",
]);

const SOCAL_STATES = new Set(["ca", "california"]);

function isSoCal(city: string, stateRegion: string): boolean {
  const state = stateRegion.trim().toLowerCase();
  if (!SOCAL_STATES.has(state)) return false;
  if (!city) return false;
  return SOCAL_CITIES.has(city.trim().toLowerCase());
}

function isLicensed(licenseType: string): boolean {
  return licenseType.trim().length > 0;
}

function isWillingInHome(sessionPreference: string): boolean {
  return sessionPreference === "In-Home" || sessionPreference === "Both";
}

export function calculateLeadScore(record: ResumeRecord): string {
  const { licenseType, yearsOutOfSchool, stateRegion, city, sessionPreference } = record;

  if (!sessionPreference) return "";

  const licensed = isLicensed(licenseType);
  const socal = isSoCal(city, stateRegion);
  const inHome = isWillingInHome(sessionPreference);
  const years = parseInt(yearsOutOfSchool, 10);
  const hasYears = !isNaN(years);

  // 5 - Great Fit: Licensed + 3+ years + SoCal + in-home willing
  if (licensed && socal && inHome && hasYears && years >= 3) {
    return "5 - Great Fit";
  }

  // 4 - Good Fit: Licensed + 0-2 years + SoCal + in-home willing
  if (licensed && socal && inHome && hasYears && years >= 0 && years < 3) {
    return "4 - Good Fit";
  }

  // 3 - Okay Fit: Missing one criterion
  const criteria = [licensed, socal, inHome, hasYears];
  const metCount = criteria.filter(Boolean).length;

  if (metCount >= 3) {
    return "3 - Okay Fit";
  }

  // If most criteria are unmet, still default to 3
  // (2/1/0 are left as manual override only)
  return "3 - Okay Fit";
}
