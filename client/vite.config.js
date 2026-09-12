import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // GitHub Pages serves the app from /FoodRescue/ — VITE_BASE is set by the
  // deploy workflow. Local dev/build stays at the default root.
  base: process.env.VITE_BASE || "/",
}));
