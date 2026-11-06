import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works at a domain root or a subpath.
  base: "./",
  test: {
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
});
