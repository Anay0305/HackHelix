import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Check, ArrowRight, Globe2, Bell, Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { useAuthStore } from "@/store";
import { restClient } from "@/api/rest";
import type { DisabilityCategory } from "@/api/types";
import { HardwareCheck } from "../components/HardwareCheck";

const categoryLabels: Record<DisabilityCategory, string> = {
  hearing: "Hearing impairment",
  speech: "Speech impairment",
  visual: "Visual impairment",
  locomotor: "Locomotor disability",
  multiple: "Multiple disabilities",
  other: "Other",
};

type Lang = "en" | "hi" | "bilingual";

export function ProfileSetupPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const markOnboardingComplete = useAuthStore((s) => s.markOnboardingComplete);

  const [step, setStep] = useState(0);
  const [preferredLanguage, setPreferredLanguage] = useState<Lang>("bilingual");
  const [notif, setNotif] = useState({
    benefitUpdates: true,
    lessonReminders: true,
    emergencyAlerts: true,
  });

  const total = 4;
  const progress = (step + 1) / total;

  if (!user) {
    navigate("/login");
    return null;
  }

  async function finish() {
    try {
      const profile = await restClient.updateProfile({
        preferredLanguage,
        notifications: notif,
      });
      setProfile(profile);
      markOnboardingComplete();
      toast.success("You're all set!");
      navigate("/simulator");
    } catch {
      toast.error("Failed to save profile");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto mt-8"
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>
          Step {step + 1} of {total}
        </span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <Progress value={progress} className="mb-6" />

      <Card>
        <CardContent className="pt-8 pb-8">
          {step === 0 && (
            <div>
              <StepHeader
                icon={<Check className="h-5 w-5" />}
                title="Confirm your details"
                subtitle="Auto-detected from your UDID."
                tone="emerald"
              />
              <div className="mt-6 rounded-xl2 glass divide-y divide-white/5">
                <Row label="Name" value={user.displayName} />
                <Row label="UDID" value={user.udid} mono />
                <Row
                  label="Category"
                  value={categoryLabels[user.disabilityCategory]}
                />
                <Row label="State" value={user.state} />
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={() => setStep(1)} aria-label="Continue to hardware check">
                  Looks good <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <StepHeader
                icon={<Cpu className="h-5 w-5" />}
                title="Hardware check"
                subtitle="Toggle the devices you'll use in the simulator."
                tone="brand"
              />
              <div className="mt-6">
                <HardwareCheck />
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button onClick={() => setStep(2)} aria-label="Continue to language selection">
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <StepHeader
                icon={<Globe2 className="h-5 w-5" />}
                title="Preferred language"
                tone="brand"
              />
              <div className="mt-6 space-y-2">
                {(
                  [
                    { v: "en" as Lang, l: "English" },
                    { v: "hi" as Lang, l: "हिन्दी" },
                    { v: "bilingual" as Lang, l: "Bilingual" },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setPreferredLanguage(opt.v)}
                    aria-pressed={preferredLanguage === opt.v}
                    className={`w-full text-left rounded-xl border px-4 py-4 flex items-center justify-between transition-all focus-ring ${
                      preferredLanguage === opt.v
                        ? "border-brand-purple/60 bg-gradient-brand-soft"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <span className="font-medium text-ink">{opt.l}</span>
                    {preferredLanguage === opt.v && (
                      <Check className="h-4 w-4 text-brand-purple" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <StepHeader
                icon={<Bell className="h-5 w-5" />}
                title="Notifications"
                subtitle="Change any time in Settings."
                tone="amber"
              />
              <div className="mt-6 space-y-2">
                {(
                  [
                    { key: "benefitUpdates", label: "New benefits" },
                    { key: "lessonReminders", label: "Lesson reminders" },
                    { key: "emergencyAlerts", label: "Emergency alerts" },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-3 rounded-xl glass p-4 cursor-pointer hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={notif[opt.key]}
                      onChange={(e) =>
                        setNotif((n) => ({ ...n, [opt.key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-brand-purple"
                      aria-label={opt.label}
                    />
                    <span className="text-sm font-medium text-ink">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={finish} aria-label="Finish setup and enter simulator">
                  Finish <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StepHeader({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone: "brand" | "emerald" | "amber";
}) {
  const bg = {
    brand: "bg-brand-primary text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)]",
    emerald: "bg-emerald-500 text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)]",
    amber: "bg-amber-500 text-white shadow-[0_8px_24px_rgba(245,158,11,0.35)]",
  }[tone];
  return (
    <>
      <div className={`h-12 w-12 rounded-xl grid place-items-center ${bg}`}>
        {icon}
      </div>
      <h2 className="font-display text-2xl font-semibold mt-4">{title}</h2>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span
        className={
          mono
            ? "font-mono tracking-wide text-ink"
            : "font-medium text-ink capitalize"
        }
      >
        {value}
      </span>
    </div>
  );
}
