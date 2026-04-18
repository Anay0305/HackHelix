import { useState } from "react";
import { Mic, Camera, Check } from "lucide-react";
import { cn } from "@/lib/cn";

type Permission = "idle" | "requesting" | "granted" | "denied";

interface HardwareCheckProps {
  onStateChange?: (state: { mic: Permission; cam: Permission }) => void;
}

export function HardwareCheck({ onStateChange }: HardwareCheckProps) {
  const [mic, setMic] = useState<Permission>("idle");
  const [cam, setCam] = useState<Permission>("idle");

  function update(key: "mic" | "cam", value: Permission) {
    if (key === "mic") setMic(value);
    else setCam(value);
    onStateChange?.({ mic: key === "mic" ? value : mic, cam: key === "cam" ? value : cam });
  }

  async function toggleMic() {
    if (mic === "granted") {
      update("mic", "idle");
      return;
    }
    update("mic", "requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release — we only needed confirmation
      stream.getTracks().forEach((t) => t.stop());
      update("mic", "granted");
    } catch {
      update("mic", "denied");
    }
  }

  async function toggleCam() {
    if (cam === "granted") {
      update("cam", "idle");
      return;
    }
    update("cam", "requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      update("cam", "granted");
    } catch {
      update("cam", "denied");
    }
  }

  return (
    <div className="space-y-3">
      <HardwareToggle
        label="Microphone"
        description="So the simulator can hear you speak."
        icon={Mic}
        state={mic}
        onToggle={toggleMic}
      />
      <HardwareToggle
        label="Camera"
        description="So we can watch you sign on screen."
        icon={Camera}
        state={cam}
        onToggle={toggleCam}
      />
    </div>
  );
}

function HardwareToggle({
  label,
  description,
  icon: Icon,
  state,
  onToggle,
}: {
  label: string;
  description: string;
  icon: typeof Mic;
  state: Permission;
  onToggle: () => void;
}) {
  const active = state === "granted";
  const busy = state === "requesting";
  const denied = state === "denied";

  return (
    <div
      className={cn(
        "rounded-xl2 glass p-4 flex items-center gap-4 transition-all",
        active && "border-brand-purple/40",
        denied && "border-brand-rose/40",
      )}
    >
      <div
        className={cn(
          "h-12 w-12 rounded-lg grid place-items-center transition-all",
          active
            ? "bg-gradient-brand text-white shadow-glow-brand"
            : "bg-white/5 text-muted",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink">{label}</p>
        <p className="text-xs text-muted mt-0.5">
          {denied
            ? "Access denied. Allow in browser settings and try again."
            : busy
              ? "Waiting for permission…"
              : description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${active ? "Disable" : "Enable"} ${label.toLowerCase()}`}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          "relative h-7 w-12 rounded-full transition-colors focus-ring",
          active ? "bg-gradient-brand" : "bg-white/10",
          busy && "opacity-70",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-lg transition-transform grid place-items-center text-brand-purple",
            active ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        >
          {active && <Check className="h-3 w-3" />}
        </span>
      </button>
    </div>
  );
}
