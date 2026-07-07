import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
// NOTE (ACT-477): mcpPlugin() intentionally NOT imported/invoked.
// Per ACT-476, supabase/functions/mcp/index.ts is operator-OWNED (banner removed
// to take ownership; file is lint-clean, tool surface FROZEN per H-SEC-5 at
// exactly app_info + echo). The plugin's sole job is scaffold regeneration —
// which is deliberately ended. The committed, owned index.ts IS the artifact.
// Re-enabling this plugin would throw on startup ("refusing to overwrite
// user-authored file"); any future tool addition requires the H-SEC-5 FP +
// OAuth 2.1 path, not plugin re-enablement.

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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core", "@sentry/react"],
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 200,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-core': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-toast',
          ],
        },
      },
    },
  },
}));