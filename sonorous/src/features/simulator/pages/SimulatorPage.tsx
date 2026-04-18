import { Segmented } from "@/components/ui/Segmented";
import { StatusDot } from "@/components/common/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { AvatarStage } from "../components/avatar/AvatarStage";
import { SpeechToIslPanel } from "../components/SpeechToIslPanel";
import { IslToSpeechPanel } from "../components/IslToSpeechPanel";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useSimulatorSocket } from "../hooks/useSimulatorSocket";
import { formatLatency } from "@/lib/format";
import { Mic, Camera, Gauge } from "lucide-react";

export function SimulatorPage() {
  const mode = useSimulatorStore((s) => s.mode);
  const setMode = useSimulatorStore((s) => s.setMode);
  const wsStatus = useSimulatorStore((s) => s.wsStatus);
  const latency = useSimulatorStore((s) => s.latencyMs);

  useSimulatorSocket();

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] text-ink">
      {/* Controls bar */}
      <div className="glass-subtle flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/5">
        <Segmented
          ariaLabel="Translation direction"
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            {
              value: "speech2isl",
              label: "Speech",
              ariaLabel: "Speech to sign language",
              icon: <Mic className="h-3.5 w-3.5" />,
            },
            {
              value: "isl2speech",
              label: "Sign",
              ariaLabel: "Sign language to speech",
              icon: <Camera className="h-3.5 w-3.5" />,
            },
          ]}
        />
        <div className="flex-1" />
        <Badge
          variant="muted"
          aria-label={`Round-trip latency: ${formatLatency(latency)}`}
          className="hidden sm:inline-flex"
        >
          <Gauge className="h-3 w-3" aria-hidden />
          {formatLatency(latency)}
        </Badge>
        <StatusDot status={wsStatus} />
      </div>

      {/* Main area — STRICT 50/50 on lg+ */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-4 p-4 md:p-6 overflow-y-auto scrollbar-thin">
        {/* Left: avatar (ISL output) */}
        <div className="min-h-[420px] lg:min-h-0">
          <AvatarStage />
        </div>

        {/* Right: interaction panel (speech/camera input) */}
        <div className="glass rounded-xl2 p-5 md:p-6 overflow-y-auto scrollbar-thin">
          {mode === "speech2isl" ? <SpeechToIslPanel /> : <IslToSpeechPanel />}
        </div>
      </div>
    </div>
  );
}
