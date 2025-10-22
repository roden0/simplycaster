import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import CrewManager from "../islands/CrewManager.tsx";
import type { CrewMember, ActiveRoom } from "../components/CrewList.tsx";
import { getCopy } from "../lib/copy.ts";

export default define.page(function Crew(_ctx) {
  // TODO: Get these from authentication and API
  const currentUserId = "user-123"; // TODO: Get from authentication
  const isAdmin = false; // TODO: Determine from user role
  const isHost = true; // TODO: Determine from user role

  // TODO: Fetch initial crew members from database
  // For now, pass empty arrays - data will be loaded via API calls in the component
  const initialCrewMembers: CrewMember[] = [];
  const initialActiveRooms: ActiveRoom[] = [];

  return (
    <div class="crew-page">
      <Head>
        <title>{getCopy("crew.title")} - {getCopy("app.name")}</title>
        <meta name="description" content={getCopy("crew.subtitle")} />
      </Head>

      <CrewManager
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        isHost={isHost}
        initialCrewMembers={initialCrewMembers}
        initialActiveRooms={initialActiveRooms}
      />
    </div>
  );
});
