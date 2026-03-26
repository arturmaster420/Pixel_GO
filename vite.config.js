import { defineConfig } from "vite";

function pickManualChunk(id) {
  if (!id) return undefined;
  if (id.includes('node_modules')) return 'vendor';
  return undefined;
}

export default defineConfig({
  base: "/Pixel_GO/",
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
