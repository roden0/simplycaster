import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import LoginForm from "../islands/LoginForm.tsx";

function LoginPage({ error }: { error?: string }) {
  return (
    <div class="login-page">
      <Head>
        <title>Sign In</title>
      </Head>

      <LoginForm error={error} />
    </div>
  );
}

export default define.page(LoginPage);

export const handler = define.handlers({
  GET(ctx) {
    const error = ctx.url.searchParams.get("error");
    return ctx.render(<LoginPage error={error || undefined} />);
  },
  
  async POST(req) {
    // Handle form submission
    const formData = await req.formData();
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();

    if (!email || !password) {
      return new Response("Email and password are required", { status: 400 });
    }

    try {
      // Call the authentication API
      const response = await fetch(new URL("/api/auth/login", req.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": req.headers.get("x-forwarded-for") || "",
          "x-real-ip": req.headers.get("x-real-ip") || "",
          "user-agent": req.headers.get("user-agent") || ""
        },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to dashboard on successful login
        return new Response("", {
          status: 302,
          headers: {
            "Location": "/dashboard",
            // Forward the auth cookie from the API response
            "Set-Cookie": response.headers.get("Set-Cookie") || ""
          }
        });
      } else {
        // Redirect back to login with error
        const errorParam = encodeURIComponent(result.error || "Login failed");
        return new Response("", {
          status: 302,
          headers: {
            "Location": `/?error=${errorParam}`
          }
        });
      }
    } catch (error) {
      console.error("Login form submission error:", error);
      return new Response("", {
        status: 302,
        headers: {
          "Location": "/?error=Internal%20server%20error"
        }
      });
    }
  }
});
