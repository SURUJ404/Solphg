import React from "react";

const cards = [
  {
    icon: "⚙️",
    bg: "rgba(137,180,250,0.15)",
    title: "@solshift/core",
    desc: "Shared types, constants, and wallet helpers that power every package in the monorepo.",
  },
  {
    icon: "🔌",
    bg: "rgba(45,231,243,0.15)",
    title: "@solshift/engine",
    desc: "Compiler client that talks to the build API — compiles Anchor programs to SBF via Docker.",
  },
  {
    icon: "💻",
    bg: "rgba(255,132,120,0.15)",
    title: "@solshift/shell",
    desc: "Terminal emulator with an interactive prompt, command history, and built-in build/deploy commands.",
  },
  {
    icon: "📦",
    bg: "rgba(166,227,161,0.15)",
    title: "@solshift/plugin-manager",
    desc: "Project and template manager — create, load, and switch between Anchor projects with ease.",
  },
  {
    icon: "🔗",
    bg: "rgba(203,166,247,0.15)",
    title: "@solshift/integrations",
    desc: "IDL parsing, PDA derivation, and serialization helpers for seamless on-chain integration.",
  },
];

export function ExploreSection() {
  return (
    <section className="l-explore">
      <h2>All Packages, One Platform</h2>
      <p className="l-pricing-sub">Every module in the Solana Playground monorepo — accessible from a single web interface.</p>
      <div className="l-explore-grid">
        {cards.map((card) => (
          <div key={card.title} className="l-explore-card">
            <div className="l-explore-card-icon" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
