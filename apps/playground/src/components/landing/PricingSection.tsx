import React from "react";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "/month",
    desc: "Everything you need to build and learn on Solana.",
    features: [
      "Browser-based IDE",
      "Anchor 0.30 support",
      "Devnet deployment",
      "5 concurrent builds",
      "Community support",
    ],
    featured: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    desc: "For serious builders shipping to mainnet.",
    features: [
      "Everything in Starter",
      "Mainnet deployment",
      "50 concurrent builds",
      "Priority build queue",
      "Custom program templates",
      "Team workspaces",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/month",
    desc: "For teams building at scale.",
    features: [
      "Everything in Pro",
      "Unlimited builds",
      "Dedicated builder instances",
      "Private key management",
      "Audit integrations",
      "Priority support",
    ],
    featured: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="l-pricing">
      <h2>Simple, Transparent Pricing</h2>
      <p className="l-pricing-sub">Start free, upgrade when you need more power.</p>
      <div className="l-pricing-grid">
        {plans.map((plan) => (
          <div key={plan.name} className={`l-pricing-card${plan.featured ? " featured" : ""}`}>
            {plan.featured && <span className="l-pricing-card-badge">Most Popular</span>}
            <span className="l-pricing-name">{plan.name}</span>
            <div className="l-pricing-price">
              {plan.price}<span>{plan.period}</span>
            </div>
            <p className="l-pricing-desc">{plan.desc}</p>
            <div className="l-pricing-features">
              {plan.features.map((f) => (
                <span key={f} className="l-pricing-feature">
                  <span className="check">✓</span> {f}
                </span>
              ))}
            </div>
            <button className={`btn-${plan.featured ? "primary" : "secondary"}`}
                    style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
              {plan.featured ? "Get Started" : "Start Free"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
