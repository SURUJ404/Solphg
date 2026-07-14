import React from "react";

export function StatsSection({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="l-stats">
      <div className="l-stats-inner">
        <div className="l-stats-grid">
          {[
            { value: "12K+", label: "Monthly Active Devs" },
            { value: "85K+", label: "Contracts Deployed" },
            { value: "500K+", label: "Builds Run" },
            { value: "150+", label: "Countries Reached" },
          ].map((s) => (
            <div key={s.label} className="l-stat-item">
              <span className="l-stat-value">{s.value}</span>
              <span className="l-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="l-stats-divider" />
        <div className="l-stats-cta">
          <span className="l-stats-tag">Free Forever</span>
          <div className="l-stats-features">
            {[
              "Browser-based IDE",
              "Anchor Framework 0.30",
              "Solana CLI 1.18",
              "One-click Deploy",
              "Wallet Integration",
              "No account required",
            ].map((f) => (
              <span key={f} className="l-stats-feature">
                <span className="check">✓</span> {f}
              </span>
            ))}
          </div>
          <button className="btn-primary" onClick={onLaunch}>
            Start Building Free
          </button>
        </div>
      </div>
    </section>
  );
}
