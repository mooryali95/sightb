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
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Keep heavy, rarely-used libraries out of the route chunks.
        //
        // By path, not by entry name. Given names, Rollup also pulls each
        // library's dependencies into its chunk, React among them (recharts
        // depends on it), so the entry imported React from vendor-charts and
        // every page, the login page included, preloaded the charts, the PDF
        // and the spreadsheet code: about 1.1 MB before anyone signed in.
        // Assigning only each library's own files leaves what they share with
        // the app (React, Babel helpers) to Rollup's own chunking.
        manualChunks(id) {
          // Small modules everything shares, named so no manual chunk can
          // claim them: React, clsx, and the helpers Rollup and Vite inject for
          // CommonJS interop and for loading lazy chunks.
          if (id.startsWith("\0vite/preload-helper") || id.startsWith("\0commonjsHelpers")) return "vendor-core";
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-is|clsx)\//.test(id)) return "vendor-core";
          if (/node_modules\/(recharts|recharts-scale|victory-vendor|d3-[^/]+|internmap)\//.test(id)) return "vendor-charts";
          if (/node_modules\/(jspdf|jspdf-autotable)\//.test(id)) return "vendor-pdf";
          if (/node_modules\/write-excel-file\//.test(id)) return "vendor-xlsx";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    // One React for the whole app. When the dev server re-bundles its
    // dependencies mid-session, a page can otherwise mix two React copies and
    // crash with "dispatcher is null" on the first hook.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
