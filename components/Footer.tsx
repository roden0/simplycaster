import {getCopy} from "../lib/copy.ts";

export interface FooterProps {
  // Future: links, copyright, etc.
}

const copyright = getCopy("footer.copyright", {year: new Date().getFullYear()});

export default function Footer({}: FooterProps = {}) {
  return (
    <footer class="app-footer" role="contentinfo">
      <div class="footer-content">
        <p class="footer-text">
          {copyright}
        </p>
        <nav
          class="footer-nav"
          role="navigation"
          aria-label="Footer navigation"
        >
          {/* Placeholder for future navigation links */}
          <div class="footer-links">
            <span class="footer-link-placeholder">{getCopy("common.contact")}</span>
            <span class="footer-link-placeholder">{getCopy("common.terms")}</span>
            <span class="footer-link-placeholder">{getCopy("common.privacy")}</span>
          </div>
        </nav>
      </div>
    </footer>
  );
}
