import { expect } from "@std/expect";
import { buildFreshApp, startTestServer } from "./test-utils.ts";

Deno.test("Room page renders correctly", async () => {
  const app = await buildFreshApp();
  const { server, address } = startTestServer(app);

  try {
    const response = await fetch(`${address}/room`);
    expect(response.status).toBe(200);
    
    const html = await response.text();
    expect(html).toContain("SimplyCaster");
    expect(html).toContain("room-page");
  } finally {
    server.shutdown();
  }
});

Deno.test("Room page with ID parameter", async () => {
  const app = await buildFreshApp();
  const { server, address } = startTestServer(app);

  try {
    const response = await fetch(`${address}/room?id=test-room-123`);
    expect(response.status).toBe(200);
    
    const html = await response.text();
    expect(html).toContain("SimplyCaster");
  } finally {
    server.shutdown();
  }
});