import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amountInCents: number, currency: string = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInCents / 100);
}

export function formatDimension(mm: number): string {
  return `${mm}mm`;
}

export function formatArea(wMm: number, hMm: number): string {
  const sqCm = (wMm * hMm) / 100;
  return `${sqCm.toFixed(1)} cm²`;
}
