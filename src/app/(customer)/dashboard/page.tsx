import React, { Suspense } from "react";
import { CustomerDashboardView } from "@/modules/customer/components/customer-dashboard";

export const metadata = {
  title: "Customer Dashboard · W2P Print House",
  description: "Customer portal: live order tracking, proof review & approvals, saved design library, and 1-click repeat reorder.",
};

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Suspense fallback={<div className="p-12 text-center text-sm font-mono">Loading dashboard...</div>}>
        <CustomerDashboardView />
      </Suspense>
    </div>
  );
}
