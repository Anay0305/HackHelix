import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Drawer({ open, onClose, title, children, className }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 w-full max-w-md glass-strong border-l border-white/10 shadow-2xl overflow-y-auto scrollbar-thin text-ink",
              className,
            )}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-white/5 glass-subtle px-6 py-4">
              <h2 className="font-display text-lg font-semibold text-ink">
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="h-9 w-9 grid place-items-center rounded-md text-muted hover:bg-white/10 hover:text-ink focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
