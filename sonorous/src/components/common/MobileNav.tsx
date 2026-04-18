import { NavLink } from "react-router-dom";
import {
  Languages,
  GraduationCap,
  Landmark,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDevModeStore } from "@/store";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const baseNav: NavItem[] = [
  { to: "/simulator", label: "Translate", icon: Languages },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/benefits", label: "Benefits", icon: Landmark },
];

const devNav: NavItem[] = [
  { to: "/debug", label: "Debug", icon: Terminal },
];

export function MobileNav() {
  const isDevMode = useDevModeStore((s) => s.isDevMode);
  const nav = isDevMode ? [...baseNav, ...devNav] : baseNav;
  const cols = nav.length === 4 ? "grid-cols-4" : "grid-cols-3";

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
                  "flex flex-col items-center justify-center gap-0.5 pt-2 pb-2 transition-colors focus-ring",
                  isActive ? "text-white" : "text-zinc-500",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      "h-12 w-12 grid place-items-center rounded-2xl transition-all",
                      isActive
                        ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_6px_20px_rgba(139,92,246,0.45)]"
                        : "text-zinc-500",
                    )}
                  >
                    <item.icon
                      className="h-7 w-7"
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider font-medium font-inter">
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
