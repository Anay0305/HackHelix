import { NavLink } from "react-router-dom";
import {
  Radio,
  GraduationCap,
  Landmark,
  Terminal,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore, useDevModeStore } from "@/store";
import { Logo } from "./Logo";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const baseNav: NavItem[] = [
  { to: "/simulator", label: "Simulator", icon: Radio },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/benefits", label: "Benefits", icon: Landmark },
];

const devNav: NavItem[] = [
  { to: "/debug", label: "Debugger", icon: Terminal },
];

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const isDevMode = useDevModeStore((s) => s.isDevMode);

  const nav = isDevMode ? [...baseNav, ...devNav] : baseNav;

  return (
    <aside className="relative z-10 hidden md:flex w-60 shrink-0 flex-col glass-subtle border-r border-white/5">
      <div className="flex items-center px-6 py-5 border-b border-white/5">
        <Logo size="md" />
      </div>

      <nav aria-label="Primary" className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-ring",
                isActive
                  ? "bg-brand-primary text-white shadow-[0_6px_20px_rgba(139,92,246,0.35)]"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )
            }
            aria-label={item.label}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 px-3 py-3 space-y-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all focus-ring",
              isActive
                ? "bg-white/10 text-ink"
                : "text-muted hover:bg-white/5 hover:text-ink",
            )
          }
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
        <button
          onClick={logout}
          aria-label="Sign out"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-white/5 hover:text-ink focus-ring"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>

        {user && (
          <div className="mt-3 rounded-lg glass px-3 py-2.5">
            <div className="text-xs font-medium text-ink truncate">
              {user.displayName}
            </div>
            <div className="text-[11px] text-muted font-mono mt-0.5 truncate">
              {user.udid}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
