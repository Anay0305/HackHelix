import { useEffect, useRef, useState } from "react";
import { X, Camera, Mic, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/authStore";

interface ProfileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileMenu({ open, onClose }: ProfileMenuProps) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [udid, setUdid] = useState(user?.udid ?? "");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(user?.displayName ?? "");
    setUdid(user?.udid ?? "");
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !token) return;
    setAuth({ ...user, displayName: displayName.trim(), udid: udid.trim() }, token);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  return (
    <>
      {/* Scrim */}
      <div
        aria-hidden
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in"
      />

      {/* Panel — anchored top-right on md+, centered sheet on mobile */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Profile menu"
        aria-modal="true"
        className={cn(
          "fixed z-50 animate-slide-up",
          "left-3 right-3 top-16 md:left-auto md:right-4 md:top-[72px] md:w-[360px]",
          "bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.7)]",
          "bg-zinc-950/90",
        )}
      >
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold font-space-grotesk bg-gradient-to-r from-[#8B5CF6] to-[#C05177] bg-clip-text text-transparent">
              Profile
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile menu"
              className="h-9 w-9 grid place-items-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 focus-ring transition-all"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <Field
            id="profile-username"
            label="Edit Username"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your display name"
          />

          <Field
            id="profile-udid"
            label="Edit UDID"
            value={udid}
            onChange={setUdid}
            placeholder="UDID number"
            mono
          />

          <PermissionToggle
            icon={<Camera className="h-5 w-5" aria-hidden />}
            label="Camera Permission"
            enabled={cameraEnabled}
            onToggle={() => setCameraEnabled((v) => !v)}
          />

          <PermissionToggle
            icon={<Mic className="h-5 w-5" aria-hidden />}
            label="Mic Permission"
            enabled={micEnabled}
            onToggle={() => setMicEnabled((v) => !v)}
          />

          <button
            type="submit"
            aria-label="Save profile changes"
            className={cn(
              "mt-1 inline-flex items-center justify-center gap-2 h-11 rounded-full text-sm font-semibold font-space-grotesk",
              "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white",
              "shadow-[0_6px_20px_rgba(139,92,246,0.4)]",
              "transition-all focus-ring",
              "hover:shadow-[0_8px_28px_rgba(192,81,119,0.5)] active:scale-[0.98]",
            )}
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                Saved
              </>
            ) : (
              "Save"
            )}
          </button>
        </form>
      </div>
    </>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk"
      >
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-11 rounded-xl bg-zinc-950/60 border border-white/10 px-4 text-sm text-ink placeholder:text-zinc-500",
          "focus:outline-none focus:border-[#8B5CF6]/60 focus:ring-2 focus:ring-[#8B5CF6]/25 transition-all",
          mono ? "font-mono" : "font-inter",
        )}
      />
    </div>
  );
}

function PermissionToggle({
  icon,
  label,
  enabled,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-950/60 border border-white/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "h-10 w-10 grid place-items-center rounded-full transition-all",
            enabled
              ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_4px_14px_rgba(139,92,246,0.35)]"
              : "bg-white/5 border border-white/10 text-zinc-500",
          )}
        >
          {icon}
        </span>
        <span className="text-sm font-medium font-inter text-ink">{label}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${enabled ? "enabled" : "disabled"}`}
        className={cn(
          "relative h-7 w-12 rounded-full transition-colors focus-ring",
          enabled
            ? "bg-gradient-to-r from-[#8B5CF6] to-[#C05177]"
            : "bg-zinc-700",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-all",
            enabled ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
