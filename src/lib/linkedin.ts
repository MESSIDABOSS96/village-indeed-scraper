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

  console.log(`[LinkedIn] Env vars present: apiKey=${!!apiKey}, engineId=${!!engineId}`);

  if (!apiKey || !engineId) {
    console.log("[LinkedIn] Missing env vars, returning null");
    return { linkedinUrl: null };
  }

  const contextParts = employer
    ? [employer]
    : [city, state].filter(Boolean);
  const context = contextParts.join(" ");
  const query = `"${firstName} ${lastName}" ${context} site:linkedin.com/in`;
  console.log(`[LinkedIn] Query: ${query}`);

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "1");

  const response = await fetch(url.toString());
  console.log(`[LinkedIn] Response status: ${response.status}`);

  if (!response.ok) {
    const body = await response.text();
    console.error(`[LinkedIn] Search failed: ${response.status} ${response.statusText} | Body: ${body.slice(0, 500)}`);
    return { linkedinUrl: null };
  }

  const data = await response.json();
  console.log(`[LinkedIn] Result count: ${data.items?.length ?? 0}, first link: ${data.items?.[0]?.link ?? "none"}`);

  if (data.items && data.items.length > 0) {
    const link = data.items[0].link as string;
    if (link.includes("linkedin.com/in/")) {
      return { linkedinUrl: link };
    }
  }

  return { linkedinUrl: null };
}
