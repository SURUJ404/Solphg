import React from "react";
import { Navbar } from "./components/landing/Navbar";
import { HeroSection } from "./components/landing/HeroSection";
import { StatsSection } from "./components/landing/StatsSection";
import { PartnersSection } from "./components/landing/PartnersSection";
import { BuildFeature } from "./components/landing/BuildFeature";
import { DeployFeature } from "./components/landing/DeployFeature";
import { PricingSection } from "./components/landing/PricingSection";
import { ExploreSection } from "./components/landing/ExploreSection";
import { DownloadSection } from "./components/landing/DownloadSection";
import { CommunitySection } from "./components/landing/CommunitySection";
import { Footer } from "./components/landing/Footer";
import "./landing.css";

export function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="landing-page">
      <Navbar onLaunch={onLaunch} />
      <HeroSection onLaunch={onLaunch} />
      <StatsSection onLaunch={onLaunch} />
      <PartnersSection />
      <BuildFeature />
      <DeployFeature />
      <PricingSection />
      <ExploreSection />
      <DownloadSection />
      <CommunitySection />
      <Footer />
    </div>
  );
}
