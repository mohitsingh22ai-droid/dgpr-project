import { formatINR } from "@/modules/pricing/gst";
import Link from "next/link";
import { getAllDivisions, getAllProducts } from "@/modules/catalog/catalog-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Zap,
  Sparkles,
  Sliders,
  FileCheck2,
  Cpu,
} from "lucide-react";

// Catalogue pages are cached and refreshed at most once a minute.
export const revalidate = 60;

export default async function HomePage() {
  const [DIVISIONS, PRODUCTS] = await Promise.all([getAllDivisions(), getAllProducts()]);
  return (
    <div className="flex flex-col gap-16 md:gap-24 pb-16">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 border-b border-border/60 bg-gradient-to-b from-background via-secondary/30 to-background technical-grid">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 dark:bg-brand-950/40 dark:border-brand-800 text-xs font-mono font-semibold text-brand-600 dark:text-brand-600">
              <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-ping" />
              <span>W2P · SIX DIVISIONS · ONE PLATFORM</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight font-heading leading-[1.08] text-foreground">
              Commercial Web-to-Print.
              <span className="block text-brand-500">Built for Real Production.</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl font-sans">
              Configure custom sizes on the fly, design inside precise printable zones, and generate verified 300 DPI print-ready outputs. No subscription taxes. Pure per-order efficiency.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Button asChild size="lg" className="font-semibold shadow-glow text-base">
                <Link href="#divisions">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Select Division & Customise
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="font-mono text-sm border-2">
                <Link href="/calculator">
                  <Sliders className="w-4 h-4 mr-2 text-brand-500" />
                  Instant Price Calculator
                </Link>
              </Button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-border/80 text-xs font-mono">
              <div>
                <span className="text-muted-foreground block">MANUFACTURING</span>
                <span className="font-bold text-foreground text-sm">6 Divisions</span>
              </div>
              <div>
                <span className="text-muted-foreground block">PRICING LOGIC</span>
                <span className="font-bold text-foreground text-sm">Dynamic (Zero SKU Bloat)</span>
              </div>
              <div>
                <span className="text-muted-foreground block">FILE RESOLUTION</span>
                <span className="font-bold text-foreground text-sm">300 DPI + Real Bleed</span>
              </div>
              <div>
                <span className="text-muted-foreground block">DATA ENGINE</span>
                <span className="font-bold text-foreground text-sm">Server-Side CSV Merge</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REQUIRED SURFACE 1: THE PRODUCT HUB (EQUAL-WEIGHT TILES AS NAVIGATION) */}
      <section id="divisions" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full scroll-mt-24">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-600 tracking-wider">
              Manufacturing Catalog
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading mt-1">
              The Six Manufacturing Divisions
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Choose your product family below to configure exact millimeter sizing, choose substrates, and open the designer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {DIVISIONS.map((div, idx) => (
            <Link
              key={div.id}
              href={`/divisions/${div.slug}`}
              className="group relative flex flex-col justify-between rounded-2xl glass p-6 hover-lift hover:border-brand-200"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="industrial" className="text-[11px]">
                    DIV 0{idx + 1}
                  </Badge>
                  <div
                    className="w-3.5 h-3.5 rounded-full ring-4 ring-background"
                    style={{ backgroundColor: div.accent_color }}
                  />
                </div>

                <h3 className="text-xl font-bold font-heading text-foreground group-hover:text-brand-500 transition-colors">
                  {div.name}
                </h3>
                <p className="text-xs font-mono text-muted-foreground mt-1 mb-3">
                  {div.tagline}
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                  {div.description}
                </p>
              </div>

              <div className="pt-6 mt-6 border-t border-border flex items-center justify-between text-xs font-mono">
                <span className="text-foreground font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-brand-600 dark:text-brand-600">
                  Select & Customise
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
                <span className="text-muted-foreground">Parameter-Driven</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* REQUIRED SURFACE 2: INSTANT CALCULATOR PREVIEW CALLOUT */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="rounded-2xl bg-industrial-950 text-white p-8 sm:p-12 border border-industrial-800 shadow-elevation relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-brand-500/10 to-transparent pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-brand-500/20 text-brand-600 font-mono text-xs font-semibold">
                <Zap className="w-3.5 h-3.5" />
                <span>INSTANT FORMULA PRICING ENGINE</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight">
                Stop waiting for quotation emails. Configure dimensions and get live prices.
              </h2>
              <p className="text-industrial-300 text-sm leading-relaxed max-w-xl">
                Every product calculates dynamically based on millimetric area, material multipliers, and automatic volume discount thresholds starting from 50+ units. Full GST transparency included.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild className="font-semibold shadow-glow">
                  <Link href="/calculator">
                    Launch Interactive Calculator
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="industrial" className="border-industrial-700">
                  <Link href="/divisions/race-event-numbers">
                    Race & Event Numbers (CSV Merge)
                  </Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-industrial-900 border border-industrial-800 rounded-xl p-5 font-mono text-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-industrial-800 text-industrial-400">
                <span>FORMULA MATRIX</span>
                <Badge variant="outline" className="text-[10px] text-brand-600 border-brand-500/30">
                  REAL-TIME
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-400">Base Unit Rate:</span>
                <span className="text-white">₹4.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-400">Area (75mm x 75mm):</span>
                <span className="text-white">56.3 cm² (+₹14.06)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-400">Material (Gloss Vinyl):</span>
                <span className="text-emerald-400">1.0x (Standard)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-400">Volume Tier (250 units):</span>
                <span className="text-brand-600">-30% Automated Discount</span>
              </div>
              <div className="pt-2 border-t border-industrial-800 flex justify-between font-bold text-sm">
                <span className="text-white">Total (excl. GST):</span>
                <span className="text-brand-600">₹1,445.00</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REQUIRED SURFACE 3: GALLERY OF REAL WORK ORGANIZED BY PRODUCT FAMILY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-600 tracking-wider">
              Featured Production Work
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading mt-1">
              Live Showcase of Real Print Work
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Finished physical outputs from our production floor across all six divisions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTS.map((prod) => (
            <Card key={prod.id} className="overflow-hidden group hover:border-brand-500 transition-colors">
              <div className="aspect-[4/3] w-full overflow-hidden relative bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prod.image_url}
                  alt={prod.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <Badge
                  variant="industrial"
                  className="absolute top-3 right-3 text-[10px] bg-industrial-950/90 backdrop-blur"
                >
                  {prod.division_slug.toUpperCase()}
                </Badge>
              </div>
              <CardContent className="p-5">
                <div className="text-xs font-mono text-muted-foreground mb-1">
                  Min: {prod.min_width_mm}mm · Max: {prod.max_width_mm}mm
                </div>
                <h4 className="font-bold text-base font-heading group-hover:text-brand-500 transition-colors">
                  {prod.name}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {prod.subtitle}
                </p>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    From {formatINR(prod.base_price_cents)} / unit
                  </span>
                  <Link
                    href={`/calculator?product=${prod.slug}`}
                    className="text-xs font-semibold text-brand-600 dark:text-brand-600 hover:underline flex items-center gap-1"
                  >
                    Customise & Price
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CORE OBJECTIVES VALUE PILLARS (§ 02) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full border-t border-border pt-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge variant="outline" className="mb-2 font-mono text-[11px]">
            THE PRODUCTION ADVANTAGE
          </Badge>
          <h2 className="text-3xl font-extrabold font-heading tracking-tight">
            Designed for the Workshop Floor
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Why commercial print businesses need more than just an image upload button.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl border bg-card space-y-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-950/50 flex items-center justify-center text-brand-500 font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base font-heading">Constrained In-Browser Design</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Customers design artwork locked inside bleed, trim, and safety zones. Unprintable artwork is physically impossible to submit.
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-card space-y-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-500 font-bold">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base font-heading">Versioned Proofs & Approval Gate</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every revision is logged (v1, v2). High-resolution print files stay strictly locked until the client formally approves the proof.
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-card space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500 font-bold">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base font-heading">Server-Side 300 DPI & CSV Merge</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated high-res vector output and row-by-row variable data merges (numbers, athlete names, barcodes) generated server-side.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
