import { getAllDivisions, getAllProducts } from "@/modules/catalog/catalog-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Sliders } from "lucide-react";

export const metadata = {
  title: "Live Work Gallery · W2P Print House",
  description: "Real printed work organized across our six manufacturing divisions: labels, race bibs, MTB boards, stamps, trophies, and laser cutting.",
};

export const revalidate = 60;

export default async function GalleryPage() {
  const [DIVISIONS, PRODUCTS] = await Promise.all([getAllDivisions(), getAllProducts()]);
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 text-xs font-medium">
          Production Gallery
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight">
          Physical Manufacturing Showcase
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Browse real print outcomes produced in our commercial print house, grouped by manufacturing division.
        </p>
      </div>

      {DIVISIONS.map((div) => {
        const divisionProducts = PRODUCTS.filter((p) => p.division_slug === div.slug);

        return (
          <div key={div.id} className="space-y-4 pt-4 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: div.accent_color }}
                />
                <h2 className="text-xl font-bold font-heading">{div.name}</h2>
                <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
                  — {div.tagline}
                </span>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs font-medium">
                <Link href="/#divisions">
                  Configure on Homepage
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {divisionProducts.map((prod) => (
                <Card key={prod.id} className="overflow-hidden group hover-lift" data-testid="gallery-card">
                  <div className="aspect-[4/3] w-full overflow-hidden relative bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prod.image_url}
                      alt={prod.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                      <Button asChild size="sm" className="w-full text-xs font-semibold">
                        <Link href={`/calculator?product=${prod.id}`}>
                          <Sliders className="w-3.5 h-3.5 mr-1.5" />
                          Calculate Price
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-4 space-y-1">
                    <div className="text-[11px] font-mono text-brand-500 font-semibold">
                      {prod.allowed_materials[0]?.name || "Standard Stock"}
                    </div>
                    <div className="font-bold text-sm text-foreground">{prod.name}</div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{prod.subtitle}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
