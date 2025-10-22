import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import WebRTCRoom from "../islands/WebRTCRoom.tsx";
import { getCopy } from "../lib/copy.ts";

export default define.page(function Room(ctx) {
  // TODO: Get these from URL params and authentication
  const roomId = ctx.url.searchParams.get("id") || "default-room";
  const userId = "user-123"; // TODO: Get from authentication
  const userName = "Current User"; // TODO: Get from authentication
  const isHost = true; // TODO: Determine from room ownership/authentication

  // TODO: Fetch initial participants from API
  const initialParticipants: Array<{
    id: string;
    name: string;
    isHost: boolean;
    audioEnabled: boolean;
    videoEnabled: boolean;
  }> = [];

  return (
    <div class="room-page">
      <Head>
        <title>{getCopy("room.title")} - {getCopy("app.name")}</title>
        <meta name="description" content={getCopy("room.subtitle")} />
      </Head>

      <WebRTCRoom
        roomId={roomId}
        userId={userId}
        userName={userName}
        isHost={isHost}
        initialParticipants={initialParticipants}
      />
    </div>
  );
});
