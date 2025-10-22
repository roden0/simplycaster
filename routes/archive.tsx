import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import ArchiveManager from "../islands/ArchiveManager.tsx";
import type { Recording } from "../components/ArchiveList.tsx";
import { getCopy } from "../lib/copy.ts";

export default define.page(function Archive(_ctx) {
  // TODO: Get these from authentication and API
  const userId = "user-123"; // TODO: Get from authentication
  const isHost = true; // TODO: Determine from user role
  const isAdmin = false; // TODO: Determine from user role

  // TODO: Fetch initial recordings from database
  // For now, pass empty array - data will be loaded via API calls in the component
  const initialRecordings: Recording[] = [];

  return (
    <div class="archive-page">
      <Head>
        <title>{getCopy("archive.title")} - {getCopy("app.name")}</title>
        <meta name="description" content={getCopy("archive.subtitle")} />
      </Head>

      <ArchiveManager
        userId={userId}
        isHost={isHost}
        isAdmin={isAdmin}
        initialRecordings={initialRecordings}
      />
    </div>
  );
});
