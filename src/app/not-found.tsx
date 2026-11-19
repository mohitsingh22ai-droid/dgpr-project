import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found · W2P Print House" };

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto py-24 px-4 text-center space-y-4">
      <p className="text-sm font-mono text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold font-heading">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">The link may be out of date, or the product is no longer available.</p>
      <div className="flex gap-3 justify-center">
        <Link href="/"><Button>Browse products</Button></Link>
        <Link href="/calculator"><Button variant="outline">Price calculator</Button></Link>
      </div>
    </div>
  );
}
