import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import HostSetup from "../islands/HostSetup.tsx";
import { getCopy } from "../lib/copy.ts";

export default define.page(function HostSetup(ctx) {
  // Get token from URL parameters
  const token = ctx.url.searchParams.get("token");
  const email = ctx.url.searchParams.get("email");
  
  if (!token) {
    // Redirect to login if no token provided
    return new Response("", {
      status: 302,
      headers: { Location: "/login" },
    });
  }

  return (
    <div class="host-setup-page">
      <Head>
        <title>{getCopy("hostSetup.title")} - {getCopy("app.name")}</title>
        <meta name="description" content={getCopy("hostSetup.subtitle")} />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <HostSetup
        token={token}
        email={email}
      />
    </div>
  );
});