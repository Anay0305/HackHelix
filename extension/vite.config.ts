import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset paths so chrome-extension:// URLs resolve correctly
  resolve: {
    alias: {
      // Redirect ProceduralAvatar's store import to the extension-local shim
      "@/store/simulatorStore": path.resolve(__dirname, "overlay/extensionStore.ts"),
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, "overlay/index.html"),
      },
      output: {
        // Co-locate JS with HTML so relative paths resolve under build/overlay/
        entryFileNames: "overlay/[name].js",
        chunkFileNames: "overlay/[name]-[hash].js",
        assetFileNames: "overlay/[name].[ext]",
      },
    },
  },
});
