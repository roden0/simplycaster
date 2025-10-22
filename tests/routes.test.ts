import { expect } from "@std/expect";
import { App } from "fresh";
import { type State } from "../utils.ts";

// Import actual route handlers
import { handler as apiHandler } from "../routes/api/[name].tsx";

Deno.test("API route returns name", async () => {
  const app = new App<State>()
    .get("/api/:name", apiHandler.GET)
    .handler();

  const response = await app(new Request("http://localhost/api/joe"));
  const text = await response.text();

  expect(text).toEqual("Hello, Joe!");
});
