"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const { signUp, isLoading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);
    const res = await signUp(email.trim(), password, {
      fullName: fullName.trim(),
      companyName: companyName.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setIsSubmitting(false);

    if (res.success && res.user) {
      // Attach pending guest draft if any exists (§ 03)
      try {
        const pendingDraftId =
          searchParams.get("draftId") ||
          (typeof window !== "undefined" ? localStorage.getItem("w2p_pending_draft_id") : null);

        if (pendingDraftId) {
          await fetch(`/api/drafts/${pendingDraftId}/attach-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: res.user.id,
              userEmail: res.user.email,
            }),
          });
          localStorage.removeItem("w2p_pending_draft_id");
        }
      } catch (attachErr) {
        console.warn("Could not attach draft on signup:", attachErr);
      }

      if (redirectUrl) {
        router.push(redirectUrl);
      } else {
        router.push("/dashboard");
      }
    } else {
      setErrorMsg(res.error || "Failed to create account. Please try again.");
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 w-full">
      <Card className="border-border shadow-elevation">
        <CardHeader className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 text-xs font-medium w-fit">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Customer Registration
          </span>
          <CardTitle className="text-2xl font-bold font-heading">Create Customer Account</CardTitle>
          <CardDescription>
            Register for a free customer account to save designs, approve proofs, and place 1-click reorders.
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
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="e.g. Alex Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company">Company / Club Name (Optional)</Label>
              <Input
                id="company"
                placeholder="e.g. Apex Racing Ltd"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g. +44 7700 900000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="e.g. alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password (Minimum 6 characters)</Label>
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
                  Creating Account...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  Create Account & Continue
                  <ArrowRight className="w-4 h-4 ml-1" />
                </span>
              )}
            </Button>
          </CardContent>
        </form>

        <CardFooter className="border-t pt-4 text-center justify-center text-xs text-muted-foreground bg-secondary/30">
          Already registered?{" "}
          <Link href="/login" className="text-brand-500 font-semibold hover:underline ml-1">
            Sign In to your portal
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Loading signup...</div>}>
      <SignupForm />
    </Suspense>
  );
}
