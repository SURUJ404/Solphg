import React from "react";

export function Navbar({ onLaunch, onDocs }: { onLaunch: () => void; onDocs?: () => void }) {
  return (
    <nav className="l-navbar">
      <div className="l-navbar-brand">
        <div className="l-navbar-brand-icon">S</div>
        <span>Solana Playground</span>
      </div>
      <div className="l-navbar-links">
        <a href="#features">Features</a>
        <a href="#docs" onClick={(e) => { e.preventDefault(); onDocs?.() }}>Docs</a>
        <a href="#community">Community</a>
      </div>
      <button className="l-navbar-cta" onClick={onLaunch}>
        Launch App
      </button>
      <button className="l-navbar-hamburger">☰</button>
    </nav>
  );
}
