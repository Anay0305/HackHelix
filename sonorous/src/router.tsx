import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/layouts/RootLayout";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { ProtectedRoute } from "@/app/ProtectedRoute";
import { LandingPage } from "@/features/auth/pages/LandingPage";
import { UdidLoginPage } from "@/features/auth/pages/UdidLoginPage";
import { ProfileSetupPage } from "@/features/auth/pages/ProfileSetupPage";
import { SimulatorPage } from "@/features/simulator/pages/SimulatorPage";
import { LearnHomePage } from "@/features/learning/pages/LearnHomePage";
import { LessonPage } from "@/features/learning/pages/LessonPage";
import { BenefitsPage } from "@/features/benefits/pages/BenefitsPage";
import { DebuggerPage } from "@/features/debugger/pages/DebuggerPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { NotFoundPage } from "@/features/misc/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/login", element: <UdidLoginPage /> },
      {
        path: "/onboarding",
        element: (
          <ProtectedRoute requireOnboarding={false}>
            <ProfileSetupPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    element: <RootLayout />,
    children: [
      {
        path: "/simulator",
        element: (
          <ProtectedRoute>
            <SimulatorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/learn",
        element: (
          <ProtectedRoute>
            <LearnHomePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/learn/:lessonId",
        element: (
          <ProtectedRoute>
            <LessonPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/benefits",
        element: (
          <ProtectedRoute>
            <BenefitsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/debug",
        element: (
          <ProtectedRoute>
            <DebuggerPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/settings",
        element: (
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
  { path: "/404", element: <NotFoundPage /> },
  { path: "/index", element: <Navigate to="/" replace /> },
]);
