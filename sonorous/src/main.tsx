import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { env } from "@/lib/env";

async function boot() {
  if (env.useMsw) {
    const [{ startMockWorker }, { getMockSocket }, { setSocketImpl }] =
      await Promise.all([
        import("@/mocks/browser"),
        import("@/mocks/ws"),
        import("@/api/socket"),
      ]);
    await startMockWorker();
    setSocketImpl(getMockSocket());
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
