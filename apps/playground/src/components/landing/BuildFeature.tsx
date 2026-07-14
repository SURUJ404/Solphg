import React from "react";

const buildSteps = [
  { label: "▶ Compiling", text: "anchor-lang v0.30.1", cls: "text" },
  { label: "▶ Checking", text: "solana-program v1.18.26", cls: "text" },
  { label: "▶ Building SBF", text: "my_counter (lib)", cls: "text" },
  { label: "  ⚠ Warning:", text: "unused import: `sysvar`", cls: "error" },
  { label: "✓ Compiled", text: "my_counter.so (142KB)", cls: "success" },
  { label: "✓ IDL", text: "my_counter.json generated", cls: "success" },
];

export function BuildFeature() {
  return (
    <section id="features" className="l-feature accent">
      <div className="l-feature-inner">
        <span className="l-feature-tag">Smart Contract Builder</span>
        <h2>Compile Anchor Programs Instantly</h2>
        <p className="l-feature-desc">
          Full Anchor 0.30.1 and Solana 1.18 toolchain, pre-loaded and ready.
          Write Rust, compile to SBF, deploy in one click.
        </p>
        <div className="l-feature-mockup">
          <div className="l-feature-mockup-header">
            <span>⚡ anchor build —offline</span>
            <span>Done in 12.4s</span>
          </div>
          <div className="l-feature-mockup-body">
            {buildSteps.map((step, i) => (
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
