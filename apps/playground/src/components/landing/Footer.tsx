import React from "react";

export function Footer() {
  return (
    <footer className="l-footer">
      <div className="l-footer-inner">
        <div className="l-footer-brand">
          <span className="l-footer-brand-name">Solana Playground</span>
          <p>
            The open-source Web3 IDE for building on Solana. Write, compile, and
            deploy — all from your browser.
          </p>
          <div className="l-footer-socials">
            {["𝕏", "◆", "💬", "▶", "⭐"].map((s, i) => (
              <span key={i} className="l-footer-social">{s}</span>
            ))}
          </div>
        </div>
        {[
          { title: "Product", links: ["Features", "Pricing", "Downloads", "Changelog"] },
          { title: "Developers", links: ["Docs", "API", "Templates", "Examples"] },
          { title: "Resources", links: ["Blog", "Tutorials", "FAQ", "Status"] },
          { title: "Company", links: ["About", "Careers", "Contact", "Brand"] },
        ].map((col) => (
          <div key={col.title} className="l-footer-col">
            <h4>{col.title}</h4>
            {col.links.map((link) => (
              <a key={link} href="#">{link}</a>
            ))}
          </div>
        ))}
      </div>
      <div className="l-footer-bottom">
        <span>© 2026 Solana Playground. Open source.</span>
        <div>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">License</a>
        </div>
      </div>
    </footer>
  );
}
