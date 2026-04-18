import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AudioLines } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/authStore";
import { useDevModeStore } from "@/store/devModeStore";
import { ProfileMenu } from "./ProfileMenu";

export function Header() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const registerLogoClick = useDevModeStore((s) => s.registerLogoClick);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  function onLogoClick() {
    const activated = registerLogoClick();
    if (activated) {
      toast.success("Developer mode unlocked", {
        description: "Debugger is now in your navigation.",
      });
      navigate("/debug");
      return;
    }
    navigate("/simulator");
  }

  const initial =
    user?.displayName?.trim().charAt(0).toUpperCase() ||
    user?.udid?.trim().charAt(0).toUpperCase() ||
    "S";

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-20 grid grid-cols-[auto_1fr_auto] items-center",
          "h-14 md:h-16 px-3 md:px-6 gap-3",
          "bg-zinc-950/90 backdrop-blur-md border-b border-white/10",
        )}
      >
        {/* Left — audio wave logo */}
        <button
          onClick={onLogoClick}
          aria-label="Sonorous home"
          className="inline-flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)] focus-ring"
        >
          <AudioLines className="h-5 w-5" strokeWidth={2.4} aria-hidden />
        </button>

        {/* Center — wordmark */}
        <h1
          className={cn(
            "justify-self-center text-center text-lg md:text-xl font-semibold tracking-tight select-none",
            "font-space-grotesk bg-gradient-to-r from-[#8B5CF6] to-[#C05177] bg-clip-text text-transparent",
          )}
        >
          Sonorous
        </h1>

        {/* Right — profile circle opens dropdown */}
        <button
          type="button"
          onClick={() => setIsProfileOpen((v) => !v)}
          aria-label="Open profile menu"
          aria-haspopup="dialog"
          aria-expanded={isProfileOpen}
          className={cn(
            "inline-flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-full",
            "bg-white/5 border border-white/10 text-white font-space-grotesk font-semibold text-sm",
            "hover:bg-white/10 active:scale-95 transition-all focus-ring",
            isProfileOpen &&
              "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] border-transparent shadow-[0_6px_20px_rgba(139,92,246,0.4)]",
          )}
        >
          {initial}
        </button>
      </header>

      <ProfileMenu
        open={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
    </>
  );
}
