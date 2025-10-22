import { expect } from "@std/expect";
import { App } from "fresh";
import { useSignal } from "@preact/signals";
import { type State } from "../utils.ts";
import Counter from "../islands/Counter.tsx";

function CounterPage() {
  const count = useSignal(3);
  return (
    <div class="p-8">
      <h1>Counter Test Page</h1>
      <Counter count={count} />
    </div>
  );
}

Deno.test("Counter page renders island", async () => {
  const app = new App<State>()
    .get("/counter", (ctx) => {
      return ctx.render(<CounterPage />);
    })
    .handler();

  const response = await app(new Request("http://localhost/counter"));
  const html = await response.text();

  // Verify the island's initial HTML is present
  expect(html).toContain('class="flex gap-8 py-6"');
  expect(html).toContain("Counter Test Page");
  expect(html).toContain("3");
});
