import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

function LoginPage() {
  return (
    <div class="login-page">
      <Head>
        <title>Sign In</title>
      </Head>

      <div class="login-form-container">
        <h1 class="login-title">Sign In</h1>

        <form class="w-full">
          <div class="form-group">
            <label for="email" class="form-label">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              class="form-input"
              required
              placeholder="Enter your email"
            />
          </div>

          <div class="form-group">
            <label for="password" class="form-label">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              class="form-input"
              required
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" class="primary-button">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

export default define.page(LoginPage);

export const handler = define.handlers({
  GET(ctx) {
    return ctx.render(<LoginPage />);
  },
});
