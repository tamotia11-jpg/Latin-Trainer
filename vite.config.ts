import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE_PATH || "./",
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          scheduler: ["ts-fsrs"],
          validation: ["zod"],
        },
      },
    },
  },
});
