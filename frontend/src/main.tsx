import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { env } from "@/lib/env";

async function boot() {
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
