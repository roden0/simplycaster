import { expect } from "@std/expect";
import { App } from "fresh";
import { define, type State } from "../utils.ts";

const MyLayout = define.layout(function MyLayout({ Component }) {
  return (
    <div>
      <h1>My Layout</h1>
      <Component />
    </div>
  );
});

Deno.test("MyLayout - renders heading and content", async () => {
  const handler = new App<State>()
    .appWrapper(MyLayout)
    .get("/", (ctx) => ctx.render(<h1>hello</h1>))
    .handler();

  const res = await handler(new Request("http://localhost"));
  const text = await res.text();

  expect(text).toContain("My Layout");
  expect(text).toContain("hello");
});
