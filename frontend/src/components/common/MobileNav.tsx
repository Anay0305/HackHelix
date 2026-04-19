import { NavLink } from "react-router-dom";
import {
  Languages,
  GraduationCap,
  Landmark,
  Terminal,
  Phone,
  Ear,
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
  { to: "/call",      label: "Call",      icon: Phone },
  { to: "/monitor",   label: "Monitor",   icon: Ear },
  { to: "/learn",     label: "Learn",     icon: GraduationCap },
  { to: "/benefits",  label: "Benefits",  icon: Landmark },
];

const devNav: NavItem[] = [
  { to: "/debug", label: "Debug", icon: Terminal },
];

const colsMap: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function MobileNav() {
  const isDevMode    = useDevModeStore((s) => s.isDevMode);
  const monitorLive  = useSoundMonitorStore((s) => s.isLive);
  const nav          = isDevMode ? [...baseNav, ...devNav] : baseNav;
  const cols         = colsMap[nav.length] ?? "grid-cols-5";
  const compact      = nav.length >= 5;

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-30",
        "bg-zinc-950/90 backdrop-blur-md border-t border-white/10",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className={cn("grid", cols)}>
        {nav.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-1.5 transition-colors focus-ring",
                  isActive ? "text-white" : "text-zinc-500",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      "grid place-items-center rounded-xl transition-all relative",
                      compact ? "h-9 w-9" : "h-12 w-12 rounded-2xl",
                      isActive
                        ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_4px_16px_rgba(139,92,246,0.45)]"
                        : "text-zinc-500",
                    )}
                  >
                    <item.icon
                      className={compact ? "h-5 w-5" : "h-7 w-7"}
                      strokeWidth={2.2}
                      aria-hidden
                    />
                    {item.to === "/monitor" && monitorLive && (
                      <span
                        aria-hidden
                        className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse"
                      />
                    )}
                  </div>
                  <span className={cn(
                    "uppercase tracking-wider font-medium font-inter",
                    compact ? "text-[8px]" : "text-[9px]",
                  )}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
