// Background service worker for HackHelix ISL extension
// Handles context menu creation and API calls to localhost:8000

const BACKEND_URL = "http://localhost:8000";

async function sendToContentScript(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    // Content script not yet injected (tab was open before extension loaded).
    // Inject it now and retry once.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sign-in-isl",
    title: "Sign in ISL",
    contexts: ["selection"],
  });
  console.log("HackHelix ISL extension installed");
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "sign-in-isl" || !info.selectionText) {
    return;
  }

  const selectedText = info.selectionText.trim();
  if (!selectedText) {
    return;
  }

  try {
    // Call backend to get ISL pose data
    const response = await fetch(`${BACKEND_URL}/isl/pose/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: selectedText }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const poseData = await response.json();

    // Send pose data to content script; inject first if not yet present
    await sendToContentScript(tab.id, {
      type: "showOverlay",
      poseData,
      selectedText,
    });
  } catch (error) {
    console.error("Failed to fetch ISL pose data:", error);
    try {
      await sendToContentScript(tab.id, {
        type: "showError",
        error: error.message || "Failed to connect to backend",
      });
    } catch (_) {}
  }

});
