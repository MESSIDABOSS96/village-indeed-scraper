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
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return { linkedinUrl: null };
  }

  const contextParts = employer
    ? [employer]
    : [city, state].filter(Boolean);
  const context = contextParts.join(" ");
  const query = `${firstName} ${lastName} ${context} site:linkedin.com/in`;

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "3");

  const response = await fetch(url.toString(), {
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.error(`[LinkedIn] Search failed: ${response.status} ${response.statusText}`);
    return { linkedinUrl: null };
  }

  const data = await response.json();
  const results = data.web?.results ?? [];

  for (const result of results) {
    if (result.url?.includes("linkedin.com/in/")) {
      return { linkedinUrl: result.url };
    }
  }

  return { linkedinUrl: null };
}
