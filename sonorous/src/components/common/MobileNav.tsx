import { NavLink } from "react-router-dom";
import {
  Radio,
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
  { to: "/simulator", label: "Translate", icon: Radio },
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
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-subtle border-t border-white/5"
    >
      <ul className={cn("grid", cols)}>
        {nav.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-medium transition-colors focus-ring",
                  isActive ? "text-ink" : "text-muted",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      "h-8 w-8 grid place-items-center rounded-full transition-all",
                      isActive &&
                        "bg-brand-primary text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)]",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                  </div>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
