import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

function Dashboard() {
  return (
    <div class="page-container">
      <Head>
        <title>Dashboard</title>
      </Head>
      <h1>Dashboard</h1>
    </div>
  );
}

export default define.page(Dashboard);
