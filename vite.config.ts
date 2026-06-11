import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: ".",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false
  },
  resolve: {
    alias: {
      "@renderer": path.resolve(__dirname, "src/renderer")
    }
  }
});
