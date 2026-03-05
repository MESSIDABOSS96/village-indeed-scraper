// Village Indeed Scraper - Service Worker

const DEFAULT_POLL_MINUTES = 5;
const MAX_CANDIDATES_PER_CYCLE = 20;
const NAV_DELAY_MS = 2000;

// Extract the Indeed candidate ID from a profile URL to use as a stable dedup key
function normalizeIndeedUrl(url) {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id");
    if (id) {
      return `https://employers.indeed.com/candidates/view?id=${id}`;
    }
  } catch (_) {}
  return url;
}

// --- Alarm & Lifecycle ---

chrome.runtime.onInstalled.addListener(async () => {
  const { pollMinutes } = await chrome.storage.local.get("pollMinutes");
  const interval = pollMinutes || DEFAULT_POLL_MINUTES;
  chrome.alarms.create("syncCandidates", { periodInMinutes: interval });
  chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  console.log("[Village] Extension installed, polling every", interval, "min");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncCandidates") {
    runSyncCycle();
  }
});

// --- Message handling from content scripts ---

const pendingResponses = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const key = `${tabId}`;
  const resolver = pendingResponses.get(key);
  if (resolver) {
    resolver(message);
    pendingResponses.delete(key);
  }
});

function waitForContentScript(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const key = `${tabId}`;
    const timer = setTimeout(() => {
      pendingResponses.delete(key);
      reject(new Error("Content script response timed out"));
    }, timeoutMs);

    pendingResponses.set(key, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// --- Tab helpers ---

function navigateTab(tabId, url) {
  return new Promise((resolve) => {
    const onUpdated = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(tabId, { url });
  });
}

function createBackgroundTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const onUpdated = (id, changeInfo) => {
        if (id === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve(tab);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Sync Cycle ---

let syncing = false;

async function runSyncCycle() {
  if (syncing) {
    console.log("[Village] Sync already in progress, skipping");
    return;
  }
  syncing = true;

  const { appUrl, apiKey } = await chrome.storage.local.get([
    "appUrl",
    "apiKey",
  ]);

  if (!appUrl || !apiKey) {
    await updateStatus("error", "App URL or API Key not configured");
    syncing = false;
    return;
  }

  await updateStatus("syncing", "Sync started...");
  let tab = null;
  let newCount = 0;
  let errorCount = 0;

  try {
    // 1. Open candidates list page in background tab
    tab = await createBackgroundTab(
      "https://employers.indeed.com/candidates?statusName=All&id=0"
    );

    // 2. Wait for content script to extract candidate list
    const listData = await waitForContentScript(tab.id, 30000);

    if (listData.type === "login_required") {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      await updateStatus("error", "Login required - please log into Indeed");
      if (tab) chrome.tabs.remove(tab.id);
      syncing = false;
      return;
    }

    if (listData.type !== "candidate_list" || !listData.candidates) {
      await updateStatus("error", "Failed to extract candidate list");
      if (tab) chrome.tabs.remove(tab.id);
      syncing = false;
      return;
    }

    // 3. Filter out already-processed candidates (using normalized URLs)
    const { processedIds = {} } = await chrome.storage.local.get(
      "processedIds"
    );
    const newCandidates = listData.candidates.filter(
      (c) => !processedIds[normalizeIndeedUrl(c.profileUrl)]
    );

    const toProcess = newCandidates.slice(0, MAX_CANDIDATES_PER_CYCLE);
    console.log(
      `[Village] Found ${listData.candidates.length} candidates, ${newCandidates.length} new, processing ${toProcess.length}`
    );

    // 4. For each new candidate, navigate to profile and extract
    for (const candidate of toProcess) {
      try {
        await delay(NAV_DELAY_MS);
        await navigateTab(tab.id, candidate.profileUrl);
        const profileData = await waitForContentScript(tab.id, 30000);

        if (profileData.type === "login_required") {
          chrome.action.setBadgeText({ text: "!" });
          chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
          await updateStatus(
            "error",
            "Session expired during sync - please log into Indeed"
          );
          break;
        }

        if (profileData.type !== "candidate_profile") {
          console.warn(
            "[Village] Unexpected response for",
            candidate.profileUrl
          );
          errorCount++;
          continue;
        }

        // 5. If resume PDF download URL is available, fetch and encode it
        let resumePdfBase64 = "";
        if (profileData.resumeDownloadUrl) {
          try {
            const pdfResp = await fetch(profileData.resumeDownloadUrl);
            if (pdfResp.ok) {
              const blob = await pdfResp.blob();
              const arrayBuffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              resumePdfBase64 = btoa(binary);
              console.log("[Village] Downloaded resume PDF:", resumePdfBase64.length, "chars base64");
            }
          } catch (pdfErr) {
            console.warn("[Village] Failed to download resume PDF:", pdfErr);
          }
        }

        // 6. POST to app's ingest endpoint
        const normalizedUrl = normalizeIndeedUrl(candidate.profileUrl);
        const payload = {
          indeedCandidateUrl: normalizedUrl,
          applicantName: profileData.name || candidate.name,
          location: profileData.location || candidate.location || "",
          jobTitle: profileData.jobTitle || candidate.jobTitle || "",
          resumeText: profileData.resumeText || "",
          resumePdfBase64: resumePdfBase64 || undefined,
          screenerAnswers: profileData.screenerAnswers || [],
          scrapedAt: new Date().toISOString(),
        };

        const resp = await fetch(`${appUrl}/api/indeed/ingest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          const result = await resp.json();
          if (result.status !== "duplicate") {
            newCount++;
          }
          // Mark as processed using normalized URL
          processedIds[normalizedUrl] = Date.now();
          await chrome.storage.local.set({ processedIds });
        } else {
          console.error(
            "[Village] Ingest failed:",
            resp.status,
            await resp.text()
          );
          errorCount++;
        }
      } catch (err) {
        console.error(
          "[Village] Error processing candidate:",
          candidate.profileUrl,
          err
        );
        errorCount++;
      }
    }

    // 6. Close background tab
    if (tab) chrome.tabs.remove(tab.id);

    // Update status
    chrome.action.setBadgeText({ text: newCount > 0 ? `${newCount}` : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });

    const statusMsg =
      errorCount > 0
        ? `Found ${newCount} new candidates (${errorCount} errors)`
        : `Found ${newCount} new candidates`;
    await updateStatus("ok", statusMsg);
  } catch (err) {
    console.error("[Village] Sync cycle error:", err);
    if (tab) {
      try {
        chrome.tabs.remove(tab.id);
      } catch (_) {}
    }
    await updateStatus("error", `Sync failed: ${err.message}`);
  } finally {
    syncing = false;
  }
}

async function updateStatus(status, message) {
  await chrome.storage.local.set({
    lastSyncStatus: status,
    lastSyncMessage: message,
    lastSyncTime: new Date().toISOString(),
  });
}

// --- External triggers (from popup) ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "syncNow") {
    runSyncCycle();
    sendResponse({ started: true });
  }
  if (message.action === "updateAlarm") {
    chrome.alarms.create("syncCandidates", {
      periodInMinutes: message.pollMinutes,
    });
    sendResponse({ updated: true });
  }
});
