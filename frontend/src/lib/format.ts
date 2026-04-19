export function formatLatency(ms: number) {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTime(d: Date | number) {
  const date = typeof d === "number" ? new Date(d) : d;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatConfidence(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function formatUdid(raw: string) {
  const digits = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 14);
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 6),
    digits.slice(6, 10),
    digits.slice(10, 14),
  ].filter(Boolean);
  return parts.join("-");
}

export function clampUdid(raw: string) {
  return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 14);
}

export function shortId(n = 8) {
  return Math.random().toString(36).slice(2, 2 + n);
}
