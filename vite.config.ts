import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages the site lives at /<repo-name>/. BASE_PATH is set by the deploy workflow.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? "/",
});
