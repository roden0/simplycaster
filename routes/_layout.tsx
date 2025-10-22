import { define } from "../utils.ts";
import { getCopy } from "../lib/copy.ts";
import { Partial } from "fresh/runtime";
import Header from "../components/Header.tsx";
import Footer from "../components/Footer.tsx";

const appTitle = getCopy("app.name");

export default define.layout(function Layout({ Component, state }) {
  return (
    <div class="app-layout">
      <Header title={appTitle} />

      <main class="app-main" role="main">
        <Partial name="main">
          <Component />
        </Partial>
      </main>

      <Footer />
    </div>
  );
});
