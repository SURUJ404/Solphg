import React from "react";

const features = [
  {
    icon: "⚡",
    bg: "rgba(255,107,138,0.12)",
    title: "Browser-Based IDE",
    desc: "Monaco editor with Rust syntax highlighting, file explorer, and terminal — all in your browser.",
  },
  {
    icon: "🛠",
    bg: "rgba(124,58,237,0.12)",
    title: "Anchor Smart Contracts",
    desc: "Full Anchor 0.30.1 toolchain. Write Rust, compile to SBF with one click.",
  },
  {
    icon: "🚀",
    bg: "rgba(59,130,246,0.12)",
    title: "One-Click Deploy",
    desc: "Deploy to devnet/testnet/mainnet directly from the browser. No CLI needed.",
  },
  {
    icon: "📊",
    bg: "rgba(255,107,138,0.12)",
    title: "CU Profiler",
    desc: "Simulate transactions and visualize compute unit usage with an icicle flamechart.",
  },
  {
    icon: "🔍",
    bg: "rgba(124,58,237,0.12)",
    title: "CPI Debugger",
    desc: "Parse cross-program invocation logs into a structured call tree for debugging.",
  },
  {
    icon: "💳",
    bg: "rgba(59,130,246,0.12)",
    title: "Wallet & Airdrop",
    desc: "Generate, import, or connect browser wallets. Built-in airdrop with multi-tier fallback.",
  },
];

export function FeaturesGrid({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section id="features" className="l-features">
      <div className="l-features-header">
        <h2>Everything You Need to Build on Solana</h2>
        <p>From writing Rust to deploying on mainnet — no local setup required.</p>
      </div>
      <div className="l-features-grid">
        {features.map((f) => (
          <div key={f.title} className="l-feature-card">
            <div className="l-feature-card-icon" style={{ background: f.bg }}>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
