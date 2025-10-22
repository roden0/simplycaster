import { expect } from "@std/expect";
import { App } from "fresh";
import { type State } from "../utils.ts";
import { handler as loginHandler } from "../routes/login.tsx";

Deno.test("Login Page - renders correctly", async () => {
  const app = new App<State>()
    .get("/login", loginHandler.GET)
    .handler();

  const response = await app(new Request("http://localhost/login"));
  const html = await response.text();

  // Test page structure
  expect(html).toContain('class="login-page"');
  expect(html).toContain('class="login-form-container"');
  expect(html).toContain("<title>Sign In</title>");
  expect(html).toContain('class="login-title"');
  expect(html).toContain("Sign In");
});

Deno.test("Login Page - form fields present", async () => {
  const app = new App<State>()
    .get("/login", loginHandler.GET)
    .handler();

  const response = await app(new Request("http://localhost/login"));
  const html = await response.text();

  // Test form elements
  expect(html).toContain('type="email"');
  expect(html).toContain('id="email"');
  expect(html).toContain('name="email"');
  expect(html).toContain("required");
  expect(html).toContain('placeholder="Enter your email"');

  expect(html).toContain('type="password"');
  expect(html).toContain('id="password"');
  expect(html).toContain('name="password"');
  expect(html).toContain('placeholder="Enter your password"');

  expect(html).toContain('type="submit"');
  expect(html).toContain("Sign In");
});

Deno.test("Login Page - proper labels and accessibility", async () => {
  const app = new App<State>()
    .get("/login", loginHandler.GET)
    .handler();

  const response = await app(new Request("http://localhost/login"));
  const html = await response.text();

  // Test labels are properly linked to inputs
  expect(html).toContain('for="email"');
  expect(html).toContain('for="password"');
  expect(html).toContain("<label");
});

Deno.test("Login Page - CSS classes applied", async () => {
  const app = new App<State>()
    .get("/login", loginHandler.GET)
    .handler();

  const response = await app(new Request("http://localhost/login"));
  const html = await response.text();

  // Test semantic CSS classes
  expect(html).toContain('class="login-page"');
  expect(html).toContain('class="login-form-container"');
  expect(html).toContain('class="login-title"');
  expect(html).toContain('class="form-group"');
  expect(html).toContain('class="form-label"');
  expect(html).toContain('class="form-input"');
  expect(html).toContain('class="primary-button"');
});
