import React from "react";

export function Navbar({ onLaunch }: { onLaunch: () => void }) {
  return (
    <nav className="l-navbar">
      <div className="l-navbar-brand">
        <div className="l-navbar-brand-icon">S</div>
        <span>Solana Playground</span>
      </div>
      <div className="l-navbar-links">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#docs">Docs</a>
        <a href="#community">Community</a>
      </div>
      <button className="l-navbar-cta" onClick={onLaunch}>
        Launch App
      </button>
      <button className="l-navbar-hamburger">☰</button>
    </nav>
  );
}
