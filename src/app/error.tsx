"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: a friendly message instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto py-24 px-4 text-center space-y-4" role="alert">
      <h1 className="text-2xl font-bold font-heading">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try again. If the problem continues, contact us{error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
