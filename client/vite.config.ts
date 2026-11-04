import { defineConfig } from "vite";

export default defineConfig({
  // Shown under the header so a stale tab is easy to spot.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 19).replace("T", " ")) },
});
