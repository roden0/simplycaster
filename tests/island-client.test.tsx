import { expect } from "@std/expect";
import { buildFreshApp, startTestServer } from "./test-utils.ts";

const app = await buildFreshApp();

Deno.test("Counter island renders correctly", async () => {
  const { server, address } = startTestServer(app);

  try {
    // Basic smoke test: verify the island HTML is served
    const response = await fetch(`${address}/`);
    const html = await response.text();

    expect(html).toContain('class="flex gap-8 py-6"');
    expect(html).toContain("3");
  } finally {
    await server.shutdown();
  }
});
