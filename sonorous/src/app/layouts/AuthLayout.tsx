import { Outlet } from "react-router-dom";
import { Logo } from "@/components/common/Logo";

export function AuthLayout() {
  return (
    <div className="min-h-screen relative bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Ambient mesh */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-hero"
        aria-hidden
      />
      {/* Floating orbs */}
      <div
        className="pointer-events-none absolute top-20 -left-20 h-80 w-80 rounded-full bg-brand-purple/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-10 -right-24 h-96 w-96 rounded-full bg-brand-rose/15 blur-3xl"
        aria-hidden
      />

      <header className="relative flex items-center justify-between px-6 md:px-10 py-5">
        <Logo linkTo="/" />
        <span className="hidden sm:inline text-[11px] tracking-wider uppercase text-muted font-medium">
          RPWD Act 2016 · WCAG AA
        </span>
      </header>

      <main className="relative mx-auto w-full max-w-5xl px-4 md:px-6 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
