import { defineConfig } from "vite";

function manualChunks(id) {
  if (!id) return undefined;
  if (id.includes('node_modules')) return 'vendor';
  if (id.includes('/src/world/')) return 'world';
  if (id.includes('/src/ui/')) return 'ui';
  if (id.includes('/src/core/hub/') || id.includes('/src/ui/hub/')) return 'hub';
  if (id.includes('/src/core/')) return 'core';
  if (id.includes('/src/weapons/') || id.includes('/src/buffs/') || id.includes('/src/enemies/')) return 'combat';
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
        manualChunks,
      },
    },
  },
});
