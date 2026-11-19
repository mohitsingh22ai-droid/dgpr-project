"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Calculator, Kanban, LayoutGrid, Images, LayoutDashboard, Menu, X, LogOut } from "lucide-react";

const PUBLIC_LINKS = [
  { href: "/#divisions", label: "Catalogue", icon: LayoutGrid },
  { href: "/calculator", label: "Price calculator", icon: Calculator },
  { href: "/gallery", label: "Gallery", icon: Images },
];

/** Glass top bar: pill-style links with an active state, account chip, and a mobile drawer. */
export function Navbar() {
  const { role, user, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    ...PUBLIC_LINKS,
    ...(role === "customer" ? [{ href: "/dashboard", label: "My orders", icon: LayoutDashboard }] : []),
    ...(role === "admin" ? [{ href: "/production", label: "Production", icon: Kanban }] : []),
  ];
  const isActive = (href: string) => (href.startsWith("/#") ? false : pathname === href || pathname.startsWith(`${href}/`));
  const firstName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Account";
  const initial = firstName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/60 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="W2P home">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-heading font-extrabold text-xs shadow-glow transition-transform group-hover:scale-105">
              W2P
            </span>
            <span className="font-heading font-bold text-lg tracking-tight text-foreground">Print House</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium" aria-label="Main">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200",
                  isActive(href)
                    ? "bg-brand-50 text-brand-700 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/80"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {role === "visitor" ? (
              <div className="hidden md:flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Create account</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-full bg-white/80 border border-white/70 pl-1 pr-3 py-1 shadow-sm" data-testid="nav-account">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">
                    {initial}
                  </span>
                  <span className="text-sm font-semibold text-foreground max-w-[9rem] truncate">{firstName}</span>
                  <span className="hidden sm:inline text-[10px] font-semibold uppercase text-brand-600">{role}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden md:inline-flex">
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  Sign Out
                </Button>
              </>
            )}
            <button
              onClick={() => setOpen(!open)}
              className="md:hidden p-2 rounded-xl hover:bg-white/80 text-foreground"
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/60 bg-white/90 backdrop-blur-xl px-4 py-3">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium",
                  isActive(href) ? "bg-brand-50 text-brand-700" : "text-foreground hover:bg-brand-50/60"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
            <div className="h-px bg-border my-2" />
            {role === "visitor" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm"><Link href="/login" onClick={() => setOpen(false)}>Sign In</Link></Button>
                <Button asChild size="sm"><Link href="/signup" onClick={() => setOpen(false)}>Create account</Link></Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Sign Out
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
