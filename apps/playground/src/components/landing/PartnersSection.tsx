import React from "react";

const partners = [
  "Solana", "Anchor", "Phantom", "Metaplex", "Helius",
  "Backpack", "Jupiter", "Magic Eden", "Tensor", "Drift",
];

export function PartnersSection() {
  return (
    <section className="l-partners">
      <div className="l-partners-track">
        {[...partners, ...partners].map((name, i) => (
          <span key={i} className="l-partners-item">
            ◆ {name}
          </span>
        ))}
      </div>
    </section>
  );
}
