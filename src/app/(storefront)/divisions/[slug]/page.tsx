import React from "react";
import { notFound } from "next/navigation";
import { getAllDivisions, getAllProducts } from "@/modules/catalog/catalog-store";
import { DivisionView } from "@/modules/catalog/components/division-view";

export const revalidate = 60;

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [divisions, allProducts] = await Promise.all([getAllDivisions(), getAllProducts()]);
  const division = divisions.find((d) => d.slug === slug);

  if (!division) {
    notFound();
  }

  const products = allProducts.filter((p) => p.division_slug === slug);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <DivisionView division={division} products={products} />
    </div>
  );
}
