// Village Indeed Scraper - Popup Logic

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const stored = await chrome.storage.local.get([
    "appUrl",
    "apiKey",
    "pollMinutes",
    "lastSyncStatus",
    "lastSyncMessage",
    "lastSyncTime",
  ]);

  document.getElementById("appUrl").value = stored.appUrl || "";
  document.getElementById("apiKey").value = stored.apiKey || "";
  document.getElementById("pollInterval").value = String(
    stored.pollMinutes || 5
  );

  updateStatusDisplay(stored);

  // Save settings
  document.getElementById("saveSettings").addEventListener("click", async () => {
    const appUrl = document.getElementById("appUrl").value.trim().replace(/\/$/, "");
    const apiKey = document.getElementById("apiKey").value.trim();
    const pollMinutes = parseInt(document.getElementById("pollInterval").value);

    await chrome.storage.local.set({ appUrl, apiKey, pollMinutes });

    // Update alarm interval
    chrome.runtime.sendMessage({
      action: "updateAlarm",
      pollMinutes,
    });

    showFeedback("saveSettings", "Saved!");
  });

  // Sync now
  document.getElementById("syncNow").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "syncNow" });
    document.getElementById("statusText").textContent = "Syncing...";
    document.getElementById("statusDot").className = "dot syncing";
    showFeedback("syncNow", "Started!");
    updateSyncButtons(true);
  });

  // Stop sync
  document.getElementById("stopSync").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopSync" });
    document.getElementById("statusText").textContent = "Stopping...";
    showFeedback("stopSync", "Stopping...");
  });

  // Clear history
  document.getElementById("clearHistory").addEventListener("click", async () => {
    if (confirm("Clear all processed candidate history? This will re-scrape all candidates on next sync.")) {
      await chrome.storage.local.set({ processedIds: {} });
      showFeedback("clearHistory", "Cleared!");
    }
  });

  // Poll for status updates
  setInterval(async () => {
    const status = await chrome.storage.local.get([
      "lastSyncStatus",
      "lastSyncMessage",
      "lastSyncTime",
    ]);
    updateStatusDisplay(status);
    updateSyncButtons(status.lastSyncStatus === "syncing");
  }, 2000);

  // Initial button state
  updateSyncButtons(stored.lastSyncStatus === "syncing");
});

function updateStatusDisplay(stored) {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const lastSyncTime = document.getElementById("lastSyncTime");

  if (stored.lastSyncStatus === "ok") {
    statusDot.className = "dot ok";
    statusText.textContent = stored.lastSyncMessage || "Sync complete";
  } else if (stored.lastSyncStatus === "error") {
    statusDot.className = "dot error";
    statusText.textContent = stored.lastSyncMessage || "Error";
  } else if (stored.lastSyncStatus === "syncing") {
    statusDot.className = "dot syncing";
    statusText.textContent = stored.lastSyncMessage || "Syncing...";
  } else {
    statusDot.className = "dot";
    statusText.textContent = "Not synced yet";
  }

  if (stored.lastSyncTime) {
    const d = new Date(stored.lastSyncTime);
    lastSyncTime.textContent = `Last sync: ${d.toLocaleString()}`;
  }
}

function updateSyncButtons(isSyncing) {
  document.getElementById("syncNow").style.display = isSyncing ? "none" : "";
  document.getElementById("stopSync").style.display = isSyncing ? "" : "none";
}

function showFeedback(buttonId, text) {
  const btn = document.getElementById(buttonId);
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => {
    btn.textContent = original;
  }, 1500);
}
