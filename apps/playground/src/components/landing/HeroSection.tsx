import React from "react";

  const codeLines = [
  { text: 'use anchor_lang::prelude::*;', cls: 'keyword' },
  { text: '', cls: '' },
  { text: '// Welcome to Solana Playground', cls: 'comment' },
  { text: '// Start building in your browser', cls: 'comment' },
  { text: '', cls: '' },
  { text: '#[program]', cls: 'comment' },
  { text: 'pub mod counter {', cls: 'keyword' },
  { text: '    use super::*;', cls: 'keyword' },
  { text: '', cls: '' },
  { text: '    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {', cls: 'function' },
  { text: '        let counter = &mut ctx.accounts.counter;', cls: '' },
  { text: '        counter.count = 0;', cls: '' },
  { text: '        Ok(())', cls: 'string' },
  { text: '    }', cls: 'punctuation' },
  { text: '}', cls: 'punctuation' },
];

export function HeroSection({ onLaunch, onDocs }: { onLaunch: () => void; onDocs?: () => void }) {
  return (
    <section className="l-hero">
      <div className="l-hero-glow" />
      <div className="l-hero-tag">✨ Welcome — Free for Everyone</div>
      <h1>
        Your Gateway to <span>Solana Development</span>
      </h1>
      <p className="l-hero-sub">
        Whether you're a seasoned developer or just getting started, Solana Playground gives you everything you need to build on Solana — right from your browser, with zero setup.
      </p>
      <div className="l-hero-actions">
        <button className="btn-primary" onClick={onLaunch}>
          Launch App →
        </button>
        <button className="btn-secondary" onClick={onDocs}>See Docs</button>
      </div>

      <div className="l-hero-mockup">
        <div className="l-hero-mockup-top">
          <span className="l-hero-mockup-dot" />
          <span className="l-hero-mockup-dot" />
          <span className="l-hero-mockup-dot" />
        </div>
        <div className="l-hero-mockup-body">
          <div className="l-hero-mockup-sidebar">
            <div className="l-hero-mockup-file active">lib.rs</div>
            <div className="l-hero-mockup-file">Anchor.toml</div>
            <div className="l-hero-mockup-file">Cargo.toml</div>
            <div className="l-hero-mockup-file">instructions/</div>
            <div className="l-hero-mockup-file">tests/</div>
          </div>
          <div className="l-hero-mockup-editor">
            {codeLines.map((line, i) => (
              <div key={i} className="l-hero-code-line">
                {line.cls ? (
                  <span className={line.cls}>{line.text}</span>
                ) : (
                  line.text ? <span>{line.text}</span> : <br />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
