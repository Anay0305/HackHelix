import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/common/Sidebar";
import { MobileNav } from "@/components/common/MobileNav";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function RootLayout() {
  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100">
      {/* Ambient gradient mesh */}
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-mesh opacity-60"
        aria-hidden
      />
      <Sidebar />
      <main className="relative flex-1 min-w-0 flex flex-col pb-20 md:pb-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <MobileNav />
    </div>
  );
}
