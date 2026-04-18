import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/common/Sidebar";
import { MobileNav } from "@/components/common/MobileNav";
import { Header } from "@/components/common/Header";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-ink">
      {/* Ambient gradient mesh */}
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-mesh opacity-60"
        aria-hidden
      />

      {/* Global header — uniform across all authenticated views */}
      <Header />

      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          className="relative flex-1 min-w-0 flex flex-col pb-[84px] md:pb-0"
          role="main"
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
