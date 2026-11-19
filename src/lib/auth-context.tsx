"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Profile, UserRole } from "@/types/database";

interface AuthContextType {
  user: Profile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string; user?: Profile }>;
  signUp: (email: string, pass: string, metadata: { fullName: string; companyName?: string; phone?: string }) => Promise<{ success: boolean; error?: string; user?: Profile }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole>("visitor");
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = async () => {
    try {
      // Query server session API (which strictly verifies the w2p_session HTTP-only cookie)
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setRole(data.role);
          localStorage.setItem("dh_auth_user", JSON.stringify(data.user));
          return;
        }
      }

      // If server session is invalid or logged out, strictly purge any cached user
      setUser(null);
      setRole("visitor");
      localStorage.removeItem("dh_auth_user");
    } catch (err) {
      console.warn("Auth initialization check:", err);
      setUser(null);
      setRole("visitor");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  // Server-Synchronized Sign In
  const signIn = async (email: string, pass: string): Promise<{ success: boolean; error?: string; user?: Profile }> => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: pass }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsLoading(false);
        return { success: false, error: data.error || "Invalid credentials." };
      }

      setUser(data.user);
      setRole(data.user.role);
      localStorage.setItem("dh_auth_user", JSON.stringify(data.user));
      setIsLoading(false);
      return { success: true, user: data.user };
    } catch (err: unknown) {
      setIsLoading(false);
      return { success: false, error: err instanceof Error ? err.message : "Authentication error" };
    }
  };

  // Server-Synchronized Sign Up
  const signUp = async (
    email: string,
    pass: string,
    metadata: { fullName: string; companyName?: string; phone?: string }
  ): Promise<{ success: boolean; error?: string; user?: Profile }> => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: pass,
          fullName: metadata.fullName,
          companyName: metadata.companyName,
          phone: metadata.phone,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsLoading(false);
        return { success: false, error: data.error || "Registration error." };
      }

      setUser(data.user);
      setRole(data.user.role);
      localStorage.setItem("dh_auth_user", JSON.stringify(data.user));
      setIsLoading(false);
      return { success: true, user: data.user };
    } catch (err: unknown) {
      setIsLoading(false);
      return { success: false, error: err instanceof Error ? err.message : "Registration error" };
    }
  };

  // Server-Synchronized Sign Out: Clears server cookie, client state, and caches
  const signOut = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Sign out request error:", err);
    }
    setUser(null);
    setRole("visitor");
    localStorage.removeItem("dh_auth_user");
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user && role !== "visitor",
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
