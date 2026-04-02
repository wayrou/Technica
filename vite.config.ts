import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1430,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  }
});
