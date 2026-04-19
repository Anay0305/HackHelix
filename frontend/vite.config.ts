import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "robots.txt"],
      manifest: {
        name: "Sonorous \u2014 ISL Translator",
        short_name: "Sonorous",
        description:
          "Bi-directional Indian Sign Language translation for the deaf and hard-of-hearing community.",
        theme_color: "#3730A3",
        background_color: "#0F172A",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Exclude .glb from precache so swapping model.glb isn't shadowed by
        // the service worker holding a stale copy. The avatar URL also carries
        // a ?v= bust-param, so runtime fetches always hit the current file.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
      devOptions: {
        // Disable the service worker in `npm run dev` so model swaps are
        // instantly visible and you don't need to clear site data.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
