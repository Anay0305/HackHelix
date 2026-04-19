// Derive the HTTP backend URL from the WebSocket URL so both point at the same
// host in dev (default: http://localhost:8000). Overridable via VITE_BACKEND_URL.
function deriveBackendUrl(): string {
  const override = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (override) return override.replace(/\/$/, "");
  const ws = import.meta.env.VITE_WS_URL as string | undefined;
  if (ws) {
    return ws
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:")
      .replace(/\/ws\/.*$/, "");
  }
  return `${window.location.protocol}//${window.location.host}`;
}

export const env = {
  useMsw: import.meta.env.VITE_USE_MSW === "true",
  demoMode: import.meta.env.VITE_DEMO_MODE === "1",
  apiBase: import.meta.env.VITE_API_BASE ?? "/api",
  backendUrl: deriveBackendUrl(),
  wsUrl:
    import.meta.env.VITE_WS_URL ??
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/simulator`,
  isDev: import.meta.env.DEV,
  rpmAvatarUrl:
    (import.meta.env.VITE_RPM_AVATAR_URL as string | undefined) || undefined,
};
