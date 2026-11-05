import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // The Room page (/i/<token>) and the backoffice (/backoffice/<token>).
  input: {
    main: resolve(import.meta.dirname, "index.html"),
    backoffice: resolve(import.meta.dirname, "backoffice.html"),
  },
  // Shown under the header so a stale tab is easy to spot.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 19).replace("T", " ")) },
});
