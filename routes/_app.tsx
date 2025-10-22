import { define } from "../utils.ts";
import {getCopy} from "../lib/copy.ts"
;
export default define.page(function App({ Component }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={getCopy("app.description")} />
        <meta name="theme-color" content="#ffffff" />
        <title>{getCopy("app.name")}</title>
        <link rel="stylesheet" href="/assets/styles.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            // Prevent FOUC by applying theme before page renders
            (function() {
              const savedTheme = localStorage.getItem('theme');
              if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            })();
          `,
          }}
        />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
