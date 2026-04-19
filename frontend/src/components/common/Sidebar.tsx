import { NavLink } from "react-router-dom";
import {
  Languages,
  GraduationCap,
  Landmark,
  Terminal,
  Ear,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDevModeStore, useSoundMonitorStore } from "@/store";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const baseNav: NavItem[] = [
  { to: "/simulator", label: "Translate", icon: Languages },
  { to: "/call", label: "Call", icon: Phone },
  { to: "/monitor", label: "Sound Monitor", icon: Ear },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/benefits", label: "Benefits", icon: Landmark },
];

const devNav: NavItem[] = [
  { to: "/debug", label: "Debugger", icon: Terminal },
];

export function Sidebar() {
  const isDevMode = useDevModeStore((s) => s.isDevMode);
  const monitorLive = useSoundMonitorStore((s) => s.isLive);
  const nav = isDevMode ? [...baseNav, ...devNav] : baseNav;

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        "relative z-10 hidden md:flex w-20 lg:w-60 shrink-0 flex-col",
        "bg-zinc-950/80 backdrop-blur-md border-r border-white/10",
      )}
    >
      <nav className="flex-1 px-3 py-5 space-y-1.5">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                "group flex items-center justify-center lg:justify-start gap-3",
                "rounded-xl px-3 py-3 text-sm font-medium font-space-grotesk transition-all focus-ring",
                isActive
                  ? "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white shadow-[0_6px_20px_rgba(139,92,246,0.35)]"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )
            }
          >
            <span className="relative flex shrink-0">
              <item.icon
                className="h-5 w-5"
                strokeWidth={2}
                aria-hidden
              />
              {item.to === "/monitor" && monitorLive && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                />
              )}
            </span>
            <span className="hidden lg:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
