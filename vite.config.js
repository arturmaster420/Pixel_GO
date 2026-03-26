import { defineConfig } from "vite";

function pickManualChunk(id) {
  if (!id) return undefined;
  if (id.includes('node_modules')) return 'vendor';
  if (id.includes('/src/ui/')) return 'ui';
  if (id.includes('/src/weapons/') || id.includes('/src/enemies/')) return 'combat';
  if (id.includes('/src/core/')) return 'core';
  return undefined;
}

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5175,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return pickManualChunk(id);
        },
      },
    },
  },
});
