import { useState } from "react";
import { toast } from "sonner";
import { User, Palette, Accessibility, LogOut } from "lucide-react";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store";
import { useNavigate } from "react-router-dom";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [reducedMotion, setReducedMotion] = useState(
    profile?.accessibility.reducedMotion ?? false,
  );
  const [highContrast, setHighContrast] = useState(
    profile?.accessibility.highContrast ?? false,
  );

  return (
    <div>
      <TopBar title="Settings" />
      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
        {/* Profile */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-full bg-brand-primary grid place-items-center text-white shadow-[0_4px_14px_rgba(139,92,246,0.35)]">
                <User className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="font-display font-semibold">Profile</h2>
                <p className="text-xs text-muted">Personal details on file.</p>
              </div>
            </div>
            <div className="rounded-lg glass divide-y divide-white/5">
              <Row label="Name" value={user?.displayName ?? "—"} />
              <Row label="UDID" value={user?.udid ?? "—"} mono />
              <Row
                label="Category"
                value={user?.disabilityCategory ?? "—"}
                capitalize
              />
              <Row label="State" value={user?.state ?? "—"} />
              <Row
                label="Language"
                value={profile?.preferredLanguage ?? "—"}
              />
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-full bg-brand-tertiary grid place-items-center text-white shadow-[0_4px_14px_rgba(192,81,119,0.35)]">
                <Palette className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="font-display font-semibold">Appearance</h2>
                <p className="text-xs text-muted">
                  Dark mode is the default for Phase 2.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Toggle
                label="High contrast mode"
                description="Boost text and UI contrast for readability."
                checked={highContrast}
                onChange={setHighContrast}
              />
            </div>
          </CardContent>
        </Card>

        {/* Accessibility */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-full bg-brand-secondary grid place-items-center text-white shadow-[0_4px_14px_rgba(162,92,230,0.35)]">
                <Accessibility className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="font-display font-semibold">Accessibility</h2>
                <p className="text-xs text-muted">
                  Motion and input preferences.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Toggle
                label="Reduce motion"
                description="Minimise animation and avatar idle breathing."
                checked={reducedMotion}
                onChange={(v) => {
                  setReducedMotion(v);
                  document.documentElement.dataset.reduceMotion = String(v);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-brand-rose/40">
          <CardContent className="pt-5 pb-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-brand-rose">Sign out</p>
              <p className="text-xs text-muted">
                You&apos;ll need your UDID to sign back in.
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                logout();
                toast("Signed out");
                navigate("/");
              }}
              aria-label="Sign out of Sonorous"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span
        className={`font-medium text-ink ${mono ? "font-mono" : ""} ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg glass p-4 cursor-pointer hover:bg-white/10">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-brand-purple h-4 w-4"
        aria-label={label}
      />
      <div className="flex-1">
        <div className="font-medium text-sm text-ink">{label}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
    </label>
  );
}
