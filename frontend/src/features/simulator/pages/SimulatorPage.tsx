import { StatusDot } from "@/components/common/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { SpeechToIslPanel } from "../components/SpeechToIslPanel";
import { IslToSpeechPanel } from "../components/IslToSpeechPanel";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useSimulatorSocket } from "../hooks/useSimulatorSocket";
import { formatLatency } from "@/lib/format";
import { Gauge, Languages, Hand } from "lucide-react";

export function SimulatorPage() {
  const wsStatus = useSimulatorStore((s) => s.wsStatus);
  const latency = useSimulatorStore((s) => s.latencyMs);

  useSimulatorSocket();

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-zinc-950 text-ink">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md">
        <h1 className="text-sm font-semibold tracking-tight font-space-grotesk text-ink">
          Sonorous <span className="text-zinc-500">· Bi-directional</span>
        </h1>
        <div className="flex-1" />
        <Badge
          variant="muted"
          aria-label={`Round-trip latency: ${formatLatency(latency)}`}
          className="hidden sm:inline-flex font-inter"
        >
          <Gauge className="h-3 w-3" aria-hidden />
          {formatLatency(latency)}
        </Badge>
        <StatusDot status={wsStatus} />
      </div>

      {/* Main area — two side-by-side input panels */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-4 p-4 md:p-6 overflow-y-auto scrollbar-thin">
        {/* Left: English side input (Speech → ISL) */}
        <div className="flex flex-col bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 md:p-6 min-h-[420px] lg:min-h-0 overflow-y-auto scrollbar-thin">
          <PanelHeader
            icon={<Languages className="h-4 w-4" aria-hidden />}
            label="English Input"
            sub="Speech → ISL"
          />
          <div className="flex-1 mt-4">
            <SpeechToIslPanel />
          </div>
        </div>

        {/* Right: ISL side input (ISL → Speech) */}
        <div className="flex flex-col bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 md:p-6 min-h-[420px] lg:min-h-0 overflow-y-auto scrollbar-thin">
          <PanelHeader
            icon={<Hand className="h-4 w-4" aria-hidden />}
            label="ISL Input"
            sub="Sign → Speech"
          />
          <div className="flex-1 mt-4">
            <IslToSpeechPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_4px_14px_rgba(139,92,246,0.35)]">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold font-space-grotesk text-ink">
          {label}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-inter">
          {sub}
        </p>
      </div>
    </div>
  );
}
