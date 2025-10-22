import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import InviteLanding from "../islands/InviteLanding.tsx";
import { getCopy } from "../lib/copy.ts";

export default define.page(function Invite(ctx) {
  // Get token from URL parameters
  const token = ctx.url.searchParams.get("token");
  const roomId = ctx.url.searchParams.get("room");
  
  if (!token) {
    // Redirect to login if no token provided
    return new Response("", {
      status: 302,
      headers: { Location: "/login" },
    });
  }

  return (
    <div class="invite-page">
      <Head>
        <title>{getCopy("invite.title")} - {getCopy("app.name")}</title>
        <meta name="description" content={getCopy("invite.subtitle")} />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <InviteLanding
        token={token}
        roomId={roomId}
      />
    </div>
  );
});