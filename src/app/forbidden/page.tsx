import Link from "next/link";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Access denied · W2P Print House",
  robots: { index: false },
};

/** Shown (with HTTP 403) when a signed-in non-admin requests an admin-only page. */
export default function ForbiddenPage() {
  return (
    <div className="max-w-xl mx-auto py-16 px-4 text-center" data-testid="forbidden-page">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
        <Ban className="w-8 h-8" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Authorization Forbidden</h1>
      <p className="text-muted-foreground mb-6">
        Internal staff credentials required. The production console is only available to administrator accounts.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/dashboard">
          <Button variant="outline">Back to my dashboard</Button>
        </Link>
        <Link href="/login?redirect=/production">
          <Button>Sign in as an administrator</Button>
        </Link>
      </div>
    </div>
  );
}
