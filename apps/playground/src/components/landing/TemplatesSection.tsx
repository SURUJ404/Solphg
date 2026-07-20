import React from "react";

const templates = [
  { icon: "🔢", name: "Anchor Counter", desc: "initialize, increment" },
  { icon: "👋", name: "Native Hello World", desc: "process_instruction" },
  { icon: "🪙", name: "SPL Token Transfer", desc: "create_mint, mint_to, send" },
  { icon: "🎲", name: "Coin Flip Game", desc: "initialize, play, settle" },
];

export function TemplatesSection() {
  return (
    <section className="l-templates">
      <h2>Start with a Template</h2>
      <div className="l-templates-grid">
        {templates.map((t) => (
          <div key={t.name} className="l-template-card">
            <div className="l-template-card-icon">{t.icon}</div>
            <h4>{t.name}</h4>
            <p>{t.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
