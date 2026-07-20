import React from "react";

export function Footer() {
  return (
    <footer className="l-footer">
      <div className="l-footer-inner">
        <span className="l-footer-brand">Solana Playground</span>
        <div className="l-footer-links">
          <a href="https://github.com/SURUJ404/Solphg">GitHub</a>
          <a href="https://suruj404.github.io/Solphg/">Docs</a>
          <a href="https://agile-sparkle-production-83d3.up.railway.app/api/health">API Status</a>
        </div>
      </div>
      <div className="l-footer-bottom">
        <span>Open source. Built with React, TypeScript, Express, Docker, and Solana.</span>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
