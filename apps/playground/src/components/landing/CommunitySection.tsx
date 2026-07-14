import React from "react";

export function CommunitySection() {
  return (
    <section id="community" className="l-community">
      <h2>Join the Community</h2>
      <p className="l-community-sub">
        Thousands of builders are already building on Solana Playground.
      </p>
      <div className="l-community-grid">
        {[
          { icon: "💬", bg: "rgba(137,180,250,0.15)", title: "Discord",
            desc: "Chat with the team and community, get help, share your projects." },
          { icon: "⭐", bg: "rgba(45,231,243,0.15)", title: "GitHub",
            desc: "Star the repo, contribute code, report issues, and suggest features." },
          { icon: "❤️", bg: "rgba(255,132,120,0.15)", title: "Sponsor",
            desc: "Support open-source development and get early access to features." },
        ].map((card) => (
          <div key={card.title} className="l-community-card">
            <div className="l-community-card-icon" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
          </div>
        ))}
      </div>
      <div className="l-community-row2">
        {[
          { icon: "𝕏", bg: "rgba(137,180,250,0.15)", title: "Follow on X",
            desc: "@solplayground" },
          { icon: "📬", bg: "rgba(45,231,243,0.15)", title: "Get Updates",
            desc: "Subscribe to our newsletter" },
        ].map((card) => (
          <div key={card.title} className="l-community-card small">
            <div className="l-community-card-icon" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
