interface SearchResult {
  linkedinUrl: string | null;
}

export async function lookupLinkedIn(
  firstName: string,
  lastName: string,
  city?: string,
  state?: string,
  employer?: string
): Promise<SearchResult> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

  if (!apiKey || !engineId) {
    return { linkedinUrl: null };
  }

  const contextParts = employer
    ? [employer]
    : [city, state].filter(Boolean);
  const context = contextParts.join(" ");
  const query = `"${firstName} ${lastName}" ${context} site:linkedin.com/in`;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "1");

  const response = await fetch(url.toString());

  if (!response.ok) {
    console.error(`LinkedIn search failed: ${response.status} ${response.statusText}`);
    return { linkedinUrl: null };
  }

  const data = await response.json();

  if (data.items && data.items.length > 0) {
    const link = data.items[0].link as string;
    if (link.includes("linkedin.com/in/")) {
      return { linkedinUrl: link };
    }
  }

  return { linkedinUrl: null };
}
