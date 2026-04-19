import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { env } from "@/lib/env";

/**
 * In dev, kill any leftover PWA service worker + its caches. A previous
 * production build (or prior dev session with PWA devOptions enabled) will
 * have registered `/sw.js`, which then intercepts fetches on localhost and
 * serves stale `model.glb` / bundle chunks even after we change them.
 * MSW's worker (`/mockServiceWorker.js`) is intentionally preserved.
 */
async function purgeStaleServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (reg) => {
        const url = reg.active?.scriptURL || reg.installing?.scriptURL || "";
        if (url.includes("mockServiceWorker")) return;
        await reg.unregister();
      }),
    );
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.includes("msw")).map((n) => caches.delete(n)),
      );
    }
  } catch {
    // best-effort cleanup
  }
}

async function boot() {
  if (env.isDev) {
    await purgeStaleServiceWorkers();
  }

  if (env.useMsw) {
    // MSW handles REST only (auth, benefits, learning) — real WebSocket always used
    const { startMockWorker } = await import("@/mocks/browser");
    await startMockWorker();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
