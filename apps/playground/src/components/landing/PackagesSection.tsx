import React from "react";

const packages = [
  {
    icon: "⚙️",
    bg: "rgba(255,107,138,0.12)",
    name: "@solshift/core",
    desc: "Shared types, constants, cluster config, and wallet encryption utilities.",
  },
  {
    icon: "🔌",
    bg: "rgba(124,58,237,0.12)",
    name: "@solshift/engine",
    desc: "CompilerClient HTTP client for all build service endpoints (build, deploy, simulate, profile).",
  },
  {
    icon: "💻",
    bg: "rgba(59,130,246,0.12)",
    name: "@solshift/shell",
    desc: "Terminal emulator with interactive prompt, command history, and built-in CLI commands.",
  },
  {
    icon: "📦",
    bg: "rgba(45,231,243,0.12)",
    name: "@solshift/plugin-manager",
    desc: "Project and file CRUD, template scaffolding, and localStorage persistence.",
  },
  {
    icon: "🔗",
    bg: "rgba(166,227,161,0.12)",
    name: "@solshift/integrations",
    desc: "IDL client generation, PDA derivation, and Borsh serialization helpers.",
  },
];

export function PackagesSection() {
  return (
    <section className="l-packages">
      <div className="l-packages-header">
        <h2>Monorepo Packages</h2>
        <p>Five npm workspaces powering the platform</p>
      </div>
      <div className="l-packages-grid">
        {packages.map((pkg) => (
          <div key={pkg.name} className="l-package-card">
            <div className="l-package-icon" style={{ background: pkg.bg }}>
              {pkg.icon}
            </div>
            <div className="l-package-info">
              <h4>{pkg.name}</h4>
              <p>{pkg.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
