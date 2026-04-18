export const env = {
  useMsw: import.meta.env.VITE_USE_MSW === "true",
  demoMode: import.meta.env.VITE_DEMO_MODE === "1",
  apiBase: import.meta.env.VITE_API_BASE ?? "/api",
  wsUrl:
    import.meta.env.VITE_WS_URL ??
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/simulator`,
  isDev: import.meta.env.DEV,
  rpmAvatarUrl:
    (import.meta.env.VITE_RPM_AVATAR_URL as string | undefined) || undefined,
};
