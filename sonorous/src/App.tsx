import { RouterProvider } from "react-router-dom";
import { QueryProvider } from "@/app/providers/QueryProvider";
import { ToastProvider } from "@/app/providers/ToastProvider";
import { router } from "@/router";

export default function App() {
  return (
    <QueryProvider>
      <ToastProvider />
      <RouterProvider router={router} />
    </QueryProvider>
  );
}
