import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // The Room page (/i/<token>) and the backoffice (/backoffice).
  input: {
    main: resolve(import.meta.dirname, "index.html"),
    backoffice: resolve(import.meta.dirname, "backoffice.html"),
  },
  // Shown under the header so a stale tab is easy to spot.
  define: { __BUILD__: JSON.stringify(buildInfo()) },
});

/** "2026-11-24 14:27:21 UTC · a1b2c3d": the commit from SOURCE_COMMIT (Docker builds), else from git. */
function buildInfo(): string {
  const time = `${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`;
  let commit = process.env.SOURCE_COMMIT;
  try {
    commit ||= execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    // No git (the Docker build excludes .git): the time alone.
  }
  return commit?.trim() ? `${time} · ${commit.trim().slice(0, 7)}` : time;
}
