import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, HandMetal, Phone, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";

async function createRoom(): Promise<string> {
  const base = env.wsUrl.replace(/\/ws\/simulator$/, "");
  const res  = await fetch(`${base.replace(/^ws/, "http")}/call/room`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create room");
  const data = await res.json();
  return data.room_id as string;
}

export function CallLandingPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"hearing" | "deaf" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState<"hearing" | "deaf">("deaf");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(role: "hearing" | "deaf") {
    setCreating(role);
    setError(null);
    try {
      const roomId = await createRoom();
      navigate(`/call/${roomId}?role=${role}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
      setCreating(null);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("Room code must be 6 characters");
      return;
    }
    navigate(`/call/${code}?role=${joinRole}`);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 items-center justify-center p-6 gap-8 overflow-y-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#8B5CF6] text-xs font-semibold uppercase tracking-wider mb-2">
          <Phone className="h-3.5 w-3.5" />
          Live Call
        </div>
        <h1 className="text-3xl font-bold text-white font-space-grotesk">
          Start a HackHelix Call
        </h1>
        <p className="text-zinc-400 text-sm font-inter max-w-md">
          A hearing person and a deaf person join the same room.
          Speech is converted to ISL signs in real-time, and signs are converted back to speech.
        </p>
      </div>

      <div className="w-full max-w-2xl grid md:grid-cols-2 gap-4">
        {/* Create Room */}
        <div className="flex flex-col gap-3 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            Create Room
          </p>
          <p className="text-sm text-zinc-400 font-inter">
            Get a 6-char room code and share it with your partner.
          </p>

          <div className="flex flex-col gap-2 mt-auto pt-4">
            <button
              onClick={() => handleCreate("hearing")}
              disabled={creating !== null}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm font-space-grotesk transition-all",
                "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white",
                "hover:shadow-[0_6px_24px_rgba(139,92,246,0.45)] active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {creating === "hearing" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              I'm the Hearing Person
              <ArrowRight className="h-4 w-4 ml-auto" />
            </button>

            <button
              onClick={() => handleCreate("deaf")}
              disabled={creating !== null}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm font-space-grotesk transition-all",
                "bg-white/8 border border-white/10 text-white",
                "hover:bg-white/12 hover:border-[#8B5CF6]/40 active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {creating === "deaf" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <HandMetal className="h-5 w-5 text-[#8B5CF6]" />
              )}
              I'm the Deaf Signer
              <ArrowRight className="h-4 w-4 ml-auto" />
            </button>
          </div>
        </div>

        {/* Join Room */}
        <div className="flex flex-col gap-3 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            Join Room
          </p>
          <p className="text-sm text-zinc-400 font-inter">
            Enter the 6-char room code your partner shared.
          </p>

          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="XK92P7"
            maxLength={6}
            className={cn(
              "w-full bg-zinc-950/70 border border-white/10 rounded-xl px-4 py-2.5 mt-2",
              "text-xl font-mono font-bold tracking-[0.35em] text-center text-white placeholder:text-zinc-600",
              "focus:outline-none focus:border-[#8B5CF6]/60 transition-colors",
            )}
          />

          {/* Role selection */}
          <div className="flex gap-2">
            {(["hearing", "deaf"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setJoinRole(r)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all font-space-grotesk",
                  joinRole === r
                    ? "bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 text-[#8B5CF6]"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:text-white",
                )}
              >
                {r === "hearing" ? <Mic className="h-4 w-4" /> : <HandMetal className="h-4 w-4" />}
                {r === "hearing" ? "Hearing" : "Deaf"}
              </button>
            ))}
          </div>

          <button
            onClick={handleJoin}
            disabled={joinCode.trim().length !== 6}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm font-space-grotesk transition-all mt-auto",
              "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white",
              "hover:shadow-[0_6px_24px_rgba(139,92,246,0.45)] active:scale-95",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            <Phone className="h-4 w-4" />
            Join Call
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 font-inter bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg">
          {error}
        </p>
      )}
    </div>
  );
}
