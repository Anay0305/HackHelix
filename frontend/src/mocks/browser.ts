import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

export async function startMockWorker() {
  try {
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  } catch (e) {
    console.warn("MSW failed to start:", e);
  }
}
