import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      toastOptions={{
        style: {
          fontFamily: "Inter, system-ui, sans-serif",
        },
      }}
    />
  );
}
