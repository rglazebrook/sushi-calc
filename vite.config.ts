import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative asset paths, so the build works from any folder (e.g. GitHub Pages at /sushi-calc/).
  base: "./",
  plugins: [react(), tailwindcss()],
});
