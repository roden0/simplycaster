import { expect } from "@std/expect";
import { App } from "fresh";
import { type State } from "../utils.ts";
import ThemeToggle from "../islands/ThemeToggle.tsx";

function ThemeTogglePage() {
  return (
    <div class="p-8">
      <h1>Theme Toggle Test Page</h1>
      <ThemeToggle />
    </div>
  );
}

Deno.test("ThemeToggle island renders correctly", async () => {
  const app = new App<State>()
    .get("/theme-test", (ctx) => {
      return ctx.render(<ThemeTogglePage />);
    })
    .handler();

  const response = await app(new Request("http://localhost/theme-test"));
  const html = await response.text();

  // Verify the island's initial HTML is present
  expect(html).toContain('class="theme-toggle"');
  expect(html).toContain('type="button"');
  expect(html).toContain('aria-label="Toggle theme"');
  expect(html).toContain("Theme Toggle Test Page");

  // Check that the island has the correct initial state (moon emoji for light mode)
  expect(html).toContain("🌙");

  // Check that Fresh's client-side boot script is included
  expect(html).toContain('type="module"');
});

Deno.test("ThemeToggle component structure", async () => {
  // Test that the ThemeToggle component file exists and has expected structure
  const themeToggleContent = Deno.readTextFileSync("./islands/ThemeToggle.tsx");

  // Check for required functionality
  expect(themeToggleContent).toContain("useSignal");
  expect(themeToggleContent).toContain("useEffect");
  expect(themeToggleContent).toContain("localStorage");
  expect(themeToggleContent).toContain("theme-toggle");
  expect(themeToggleContent).toContain("onClick");
  expect(themeToggleContent).toContain("aria-label");

  // Check for proper error handling
  expect(themeToggleContent).toContain("globalThis.matchMedia");
});
