import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Sonorous brand system (from design mockup)
        brand: {
          primary: "#8B5CF6",    // Primary purple
          secondary: "#A25CE6",  // Secondary purple (magenta-leaning)
          tertiary: "#C05177",   // Tertiary rose
          neutral: "#080808",    // Near-black neutral
          // Legacy aliases — keep existing class names working
          purple: "#8B5CF6",
          rose: "#C05177",
          pink: "#E879A6",
        },
        // Dark surface tokens — aligned to #080808 neutral
        ink: "#F4F4F5",
        muted: "#A1A1AA",
        surface: {
          DEFAULT: "#080808",
          subtle: "#141416",
          elevated: "#1A1A1D",
          dark: "#080808",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.14)",
        },
        // Keep legacy indigo alias for gradual migration
        indigo: {
          DEFAULT: "#8B5CF6",
          50: "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          300: "#C4B5FD",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          800: "#5B21B6",
          900: "#4C1D95",
          950: "#2E1065",
        },
        accent: {
          amber: "#F59E0B",
          emerald: "#10B981",
          rose: "#C05177",
          sky: "#0EA5E9",
          purple: "#8B5CF6",
        },
      },
      fontFamily: {
        // Space Grotesk is the primary typeface — used everywhere per brand system.
        sans: [
          "Space Grotesk",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Space Grotesk",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        "space-grotesk": [
          "Space Grotesk",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        inter: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.35)",
        "card-hover":
          "0 2px 4px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.45)",
        glow: "0 0 0 4px rgba(139,92,246,0.25)",
        "glow-strong": "0 0 0 6px rgba(139,92,246,0.35)",
        "glow-brand":
          "0 0 40px rgba(139,92,246,0.35), 0 0 80px rgba(192,81,119,0.18)",
        "glow-rose": "0 0 40px rgba(192,81,119,0.4)",
        "inner-glow": "inset 0 0 20px rgba(139,92,246,0.15)",
      },
      borderRadius: {
        xl2: "1rem",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-ring": "pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        float: "float 4s ease-in-out infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.02)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      backgroundImage: {
        "gradient-brand":
          "linear-gradient(135deg, #8B5CF6 0%, #A25CE6 50%, #C05177 100%)",
        "gradient-brand-soft":
          "linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(192,81,119,0.22) 100%)",
        "gradient-purple":
          "linear-gradient(135deg, #8B5CF6 0%, #A25CE6 100%)",
        "gradient-indigo":
          "linear-gradient(135deg, #8B5CF6 0%, #C05177 100%)",
        "gradient-surface":
          "linear-gradient(180deg, #141416 0%, #080808 100%)",
        "gradient-hero":
          "radial-gradient(ellipse at top, rgba(139,92,246,0.22) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(192,81,119,0.14) 0%, transparent 50%)",
        "gradient-mesh":
          "radial-gradient(at 20% 20%, rgba(139,92,246,0.18) 0%, transparent 45%), radial-gradient(at 80% 30%, rgba(192,81,119,0.12) 0%, transparent 50%), radial-gradient(at 50% 90%, rgba(139,92,246,0.08) 0%, transparent 50%)",
      },
    },
  },
  plugins: [],
};

export default config;
