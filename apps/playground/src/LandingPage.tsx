import React from "react";
import { Navbar } from "./components/landing/Navbar";
import { HeroSection } from "./components/landing/HeroSection";
import { FeaturesGrid } from "./components/landing/FeaturesGrid";
import { TemplatesSection } from "./components/landing/TemplatesSection";
import { PackagesSection } from "./components/landing/PackagesSection";
import { CtaSection } from "./components/landing/CtaSection";
import { CommunitySection } from "./components/landing/CommunitySection";
import { Footer } from "./components/landing/Footer";
import "./landing.css";

export function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  const handleDocs = () => {
    window.location.hash = 'docs'
    onLaunch()
  }
  return (
    <div className="landing-page">
      <Navbar onLaunch={onLaunch} onDocs={handleDocs} />
      <HeroSection onLaunch={onLaunch} onDocs={handleDocs} />
      <FeaturesGrid onLaunch={onLaunch} />
      <div className="l-divider"><hr /></div>
      <TemplatesSection />
      <div className="l-divider"><hr /></div>
      <PackagesSection />
      <CtaSection onLaunch={onLaunch} />
      <div className="l-divider"><hr /></div>
      <CommunitySection />
      <Footer />
    </div>
  );
}
