import React from "react";

const features = [
  {
    icon: "⚡",
    bg: "rgba(255,107,138,0.12)",
    title: "Works in Your Browser",
    desc: "No installations, no local setup. Just open the app and start building. Everything runs online.",
  },
  {
    icon: "🛠",
    bg: "rgba(124,58,237,0.12)",
    title: "Write Rust, Compile Instantly",
    desc: "Full smart contract toolchain built-in. Write code in Rust and compile to Solana bytecode with one click.",
  },
  {
    icon: "🚀",
    bg: "rgba(59,130,246,0.12)",
    title: "Deploy to Any Network",
    desc: "Push your program to devnet, testnet, or mainnet directly from your browser. No command line needed.",
  },
  {
    icon: "📊",
    bg: "rgba(255,107,138,0.12)",
    title: "Understand Your Program",
    desc: "Profile compute usage, debug cross-program calls, and optimize performance — all with visual tools.",
  },
  {
    icon: "💳",
    bg: "rgba(124,58,237,0.12)",
    title: "Wallet for Everyone",
    desc: "Generate a new wallet, import an existing one, or connect Phantom. Get free SOL for testing with built-in airdrop.",
  },
  {
    icon: "🎯",
    bg: "rgba(59,130,246,0.12)",
    title: "Start Fast with Templates",
    desc: "Pre-built templates for common projects. From a simple counter to a token transfer — start in seconds.",
  },
];

export function FeaturesGrid({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section id="features" className="l-features">
      <div className="l-features-header">
        <h2>Everything You Need, Nothing You Don't</h2>
        <p>An all-in-one platform for building on Solana — welcoming to everyone, from first-timers to experienced builders.</p>
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
