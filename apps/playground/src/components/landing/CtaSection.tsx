import React from "react";

export function CtaSection({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="l-cta">
      <h2>Start Building Free</h2>
      <p>No account required. No downloads. Just your browser and your ideas.</p>
      <button className="btn-primary" onClick={onLaunch}>
        Launch App →
      </button>
    </section>
  );
}
