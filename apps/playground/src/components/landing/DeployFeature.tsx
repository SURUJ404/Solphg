import React from "react";

const deploySteps = [
  { label: "✓ Build", text: "my_counter.so compiled", cls: "success" },
  { label: "✓ Keypair", text: "Generated: 8x7B9...3kPm", cls: "success" },
  { label: "→ Deploying", text: "to devnet (Tx: 5xR2...9jLm)", cls: "text" },
  { label: "✓ Confirmed", text: "Program ID: Cb5V...3xYq", cls: "success" },
  { label: "", text: "✨ Program deployed successfully!", cls: "success" },
];

export function DeployFeature() {
  return (
    <section className="l-feature">
      <div className="l-feature-inner">
        <span className="l-feature-tag">One-Click Deploy</span>
        <h2>From Code to On-Chain in Seconds</h2>
        <p className="l-feature-desc">
          Generate a wallet, connect to devnet, and deploy your program without
          ever touching a terminal.
        </p>
        <div className="l-feature-mockup">
          <div className="l-feature-mockup-header">
            <span>📦 Deploy — devnet</span>
            <span className="l-stats-feature"><span className="check">✓</span> Wallet connected</span>
          </div>
          <div className="l-feature-mockup-body">
            {deploySteps.map((step, i) => (
              <div key={i} className="l-feature-step">
                <span className={step.cls}>
                  {step.label} {step.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
