import React from "react";

export function DownloadSection() {
  return (
    <section className="l-desktop">
      <h2>Take It to the Desktop</h2>
      <p>
        Prefer a local editor? Download the Solana Playground VS Code extension
        or CLI toolchain.
      </p>
      <button className="l-desktop-btn">
        ⬇ Download for Platform
      </button>
      <div className="l-desktop-icons">
        {[
          { icon: "🍎", label: "macOS" },
          { icon: "🪟", label: "Windows" },
          { icon: "🐧", label: "Linux" },
          { icon: "S", label: "VS Code" },
        ].map((item) => (
          <div key={item.label} className="l-desktop-icon">
            <div className="icon-box">{item.icon}</div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
