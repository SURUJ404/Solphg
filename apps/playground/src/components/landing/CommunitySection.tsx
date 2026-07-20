import React from "react";

const items = [
  { icon: "💬", bg: "rgba(255,107,138,0.12)", title: "Discord",
    desc: "Chat with the team and community, get help, share your projects." },
  { icon: "⭐", bg: "rgba(124,58,237,0.12)", title: "GitHub",
    desc: "Star the repo, contribute code, report issues, and suggest features." },
  { icon: "𝕏", bg: "rgba(59,130,246,0.12)", title: "Follow on X",
    desc: "@solplayground — news, updates, and tips." },
];

export function CommunitySection() {
  return (
    <section id="community" className="l-community">
      <h2>Join the Community</h2>
      <div className="l-community-grid">
        {items.map((item) => (
          <div key={item.title} className="l-community-card">
            <div className="l-community-card-icon" style={{ background: item.bg }}>
              {item.icon}
            </div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
