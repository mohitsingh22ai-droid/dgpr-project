"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const { signIn, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    const res = await signIn(email.trim(), password);
    setIsSubmitting(false);

    if (res.success) {
      // Attach pending guest draft if any exists (§ 03)
      try {
        const pendingDraftId =
          searchParams.get("draftId") ||
          (typeof window !== "undefined" ? localStorage.getItem("w2p_pending_draft_id") : null);

        if (pendingDraftId && res.user?.id) {
          await fetch(`/api/drafts/${pendingDraftId}/attach-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: res.user.id,
              userEmail: res.user.email || email.trim(),
            }),
          });
          localStorage.removeItem("w2p_pending_draft_id");
        }
      } catch (attachErr) {
        console.warn("Could not attach draft on login:", attachErr);
      }

      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (res.user?.role === "admin") {
        router.push("/production");
      } else {
        router.push("/dashboard");
      }
    } else {
      setErrorMsg(res.error || "Authentication failed. Please check your credentials.");
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 w-full">
      <Card className="border-border shadow-elevation">
        <CardHeader className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 text-xs font-medium w-fit">
            Secure Sign In
          </span>
          <CardTitle className="text-2xl font-bold font-heading">Sign In to W2P</CardTitle>
          <CardDescription>
            Enter your email and password to access your customer dashboard or factory production pipeline.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="font-mono"
              />
            </div>

            <Button type="submit" disabled={isSubmitting || isLoading} className="w-full font-semibold">
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  Sign In
                  <ArrowRight className="w-4 h-4 ml-1" />
                </span>
              )}
            </Button>
          </CardContent>
        </form>

        <CardFooter className="flex flex-col space-y-4 border-t pt-4 bg-secondary/30">
          <div className="text-xs text-center text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-brand-500 font-semibold hover:underline">
              Create account
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-mono">Loading sign in...</div>}>
      <LoginForm />
    </Suspense>
  );
}
