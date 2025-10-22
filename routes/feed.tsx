import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import FeedManager from "../islands/FeedManager.tsx";
import type { FeedItem } from "../components/FeedList.tsx";
import { getCopy } from "../lib/copy.ts";

export default define.page(function Feed(_ctx) {
  // TODO: Get these from authentication and API
  const userId = "user-123"; // TODO: Get from authentication
  const isHost = true; // TODO: Determine from user role
  const isAdmin = false; // TODO: Determine from user role
  const rssUrl = `${globalThis.location?.origin || ""}/api/feed/rss`;

  // TODO: Fetch initial feed items from database
  // For now, pass empty array - data will be loaded via API calls in the component
  const initialFeedItems: FeedItem[] = [];

  return (
    <div class="feed-page">
      <Head>
        <title>{getCopy("feed.title")} - {getCopy("app.name")}</title>
        <meta name="description" content={getCopy("feed.subtitle")} />
        <link rel="alternate" type="application/rss+xml" title={`${getCopy("app.name")} ${getCopy("feed.title")}`} href={rssUrl} />
      </Head>

      <FeedManager
        userId={userId}
        isHost={isHost}
        isAdmin={isAdmin}
        initialFeedItems={initialFeedItems}
        rssUrl={rssUrl}
      />
    </div>
  );
});
