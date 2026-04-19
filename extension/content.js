// Content script injected into every page
// Listens for messages from background script and mounts the overlay iframe

let overlayContainer = null;
let overlayIframe = null;
let pendingOverlayPayload = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "showOverlay") {
    showOverlay(message.poseData, message.selectedText);
  } else if (message.type === "showError") {
    showError(message.error);
  }
});

function showOverlay(poseData, selectedText) {
  // Remove this instance's overlay, then also sweep any orphaned overlay left
  // by a previous content-script context (e.g. after extension reload).
  removeOverlay();
  document.getElementById("hackhelix-overlay-container")?.remove();

  pendingOverlayPayload = {
    type: "init",
    poseData,
    selectedText,
  };

  // Create overlay container
  overlayContainer = document.createElement("div");
  overlayContainer.id = "hackhelix-overlay-container";
  overlayContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    height: 500px;
    z-index: 2147483647;
    animation: slideIn 0.3s ease-out;
  `;

  // Create iframe for isolated rendering
  overlayIframe = document.createElement("iframe");
  overlayIframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;
  overlayIframe.src = chrome.runtime.getURL("build/overlay/index.html");

  overlayContainer.appendChild(overlayIframe);
  document.body.appendChild(overlayContainer);

  // Add slide-in animation
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // Listen for messages from iframe
  window.addEventListener("message", handleIframeMessage);

  // Close on click outside
  overlayContainer.addEventListener("click", (e) => {
    if (e.target === overlayContainer) {
      removeOverlay();
    }
  });
}

function handleIframeMessage(event) {
  if (event.source !== overlayIframe?.contentWindow) {
    return;
  }

  if (event.data.type === "ready" && pendingOverlayPayload) {
    overlayIframe.contentWindow.postMessage(pendingOverlayPayload, "*");
    pendingOverlayPayload = null;
  } else if (event.data.type === "close") {
    removeOverlay();
  }
}

function removeOverlay() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    overlayIframe = null;
  }
  pendingOverlayPayload = null;
  window.removeEventListener("message", handleIframeMessage);
}

function showError(errorMessage) {
  // Simple error toast
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #DC2626;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483647;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 300px;
  `;
  toast.textContent = `ISL Translation Error: ${errorMessage}`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}
