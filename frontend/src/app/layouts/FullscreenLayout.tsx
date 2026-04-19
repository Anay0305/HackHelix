import { Outlet, Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/common/Logo";

export function FullscreenLayout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="glass-subtle flex items-center justify-between px-3 md:px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="h-9 w-9 grid place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-ink md:hidden focus-ring"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Logo />
        </div>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          <Link
            to="/learn"
            className="px-3 py-2 rounded-lg text-muted hover:text-ink hover:bg-white/5 focus-ring"
          >
            Learn
          </Link>
          <Link
            to="/benefits"
            className="px-3 py-2 rounded-lg text-muted hover:text-ink hover:bg-white/5 focus-ring"
          >
            Benefits
          </Link>
          <Link
            to="/settings"
            className="px-3 py-2 rounded-lg text-muted hover:text-ink hover:bg-white/5 focus-ring"
          >
            Settings
          </Link>
        </nav>
      </header>
      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
