import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Keep heavy, rarely-used libraries out of the route chunks.
        manualChunks: {
          "vendor-charts": ["recharts"],
          // `write-excel-file` exposes only subpath exports (./browser, ./node);
          // there is no "." entry, so the bare specifier does not resolve here.
          "vendor-xlsx": ["write-excel-file/browser"],
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
