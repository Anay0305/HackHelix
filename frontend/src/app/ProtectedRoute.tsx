import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store";
import type { ReactNode } from "react";

export function ProtectedRoute({
  children,
  requireOnboarding = true,
}: {
  children: ReactNode;
  requireOnboarding?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const hasCompletedOnboarding = useAuthStore((s) => s.hasCompletedOnboarding);
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to={`/login?from=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  if (requireOnboarding && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
