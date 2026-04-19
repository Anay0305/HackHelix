import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Phone, PhoneOff, Users, Loader2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useCallSocket } from "../hooks/useCallSocket";
import { HearingCallView } from "../components/HearingCallView";
import { DeafCallView } from "../components/DeafCallView";
import type { CallRole } from "../hooks/useCallSocket";

export function CallPage() {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const [params]         = useSearchParams();
  const navigate         = useNavigate();
  const role             = (params.get("role") ?? "deaf") as CallRole;

  const socket = useCallSocket(roomId, role);
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function hangUp() {
    socket.disconnect();
    navigate("/call");
  }

  const isConnecting = socket.status === "connecting" || socket.status === "idle";
  const isError      = socket.status === "error" || socket.status === "closed";

  return (
    <div className="flex flex-col h-full min-h-screen bg-zinc-950">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <Phone className="h-3.5 w-3.5 text-[#8B5CF6]" />
            <span className="font-mono font-bold text-sm text-white tracking-widest">{roomId}</span>
            <button
              onClick={copyCode}
              aria-label="Copy room code"
              className="text-zinc-500 hover:text-white transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-inter">
            <Users className="h-3.5 w-3.5 text-zinc-500" />
            {socket.partnerConnected ? (
              <span className="text-emerald-400">Partner connected</span>
            ) : isConnecting ? (
              <span className="text-zinc-500 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
              </span>
            ) : (
              <span className="text-amber-400">Waiting for partner…</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md font-space-grotesk",
              role === "hearing"
                ? "bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/30"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
            )}
          >
            {role === "hearing" ? "🎤 Hearing" : "🤟 Deaf"}
          </span>

          <button
            onClick={hangUp}
            aria-label="End call"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all text-xs font-semibold font-space-grotesk"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            End
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-5">
        {isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <PhoneOff className="h-12 w-12 text-red-400" />
            <p className="text-zinc-400 font-inter">Connection lost.</p>
            <button
              onClick={() => navigate("/call")}
              className="px-4 py-2 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#8B5CF6] text-sm font-semibold font-space-grotesk hover:bg-[#8B5CF6]/30 transition-all"
            >
              Back to lobby
            </button>
          </div>
        ) : !socket.partnerConnected ? (
          <WaitingRoom roomId={roomId} role={role} />
        ) : role === "hearing" ? (
          <HearingCallView socket={socket} />
        ) : (
          <DeafCallView socket={socket} />
        )}
      </div>
    </div>
  );
}

function WaitingRoom({ roomId, role }: { roomId: string; role: CallRole }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    const url = `${window.location.origin}/call/${roomId}?role=${role === "hearing" ? "deaf" : "hearing"}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center py-16">
      <div className="relative">
        <div className="h-20 w-20 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 grid place-items-center">
          <Users className="h-8 w-8 text-[#8B5CF6]" />
        </div>
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-400 animate-pulse" />
      </div>

      <div className="space-y-1">
        <p className="text-lg font-semibold text-white font-space-grotesk">
          Waiting for your partner…
        </p>
        <p className="text-sm text-zinc-400 font-inter">
          Share the room code below with the {role === "hearing" ? "deaf signer" : "hearing person"}.
        </p>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10">
        <span className="font-mono font-bold text-2xl tracking-[0.3em] text-white">{roomId}</span>
      </div>

      <button
        onClick={copyLink}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#8B5CF6] text-sm font-semibold font-space-grotesk hover:bg-[#8B5CF6]/30 transition-all"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy invite link"}
      </button>

      <div className="flex items-center gap-2 text-zinc-600 text-xs font-inter">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Listening for partner to join…
      </div>
    </div>
  );
}
