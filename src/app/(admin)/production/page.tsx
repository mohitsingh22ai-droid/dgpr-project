import React from "react";
import { ProductionDashboardView } from "@/modules/pipeline/components/production-dashboard";

export const metadata = {
  title: "Production Console · W2P Print House",
  description: "Internal shop-floor management console: 6-stage pipeline, file unlock indicators, and high-resolution print package downloads.",
};

export default function ProductionPage() {
  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-6 sm:py-10">
      <ProductionDashboardView />
    </div>
  );
}
