import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Deep indigo accent (calls to action, links, active states)
        brand: {
          50: "#EEF0FF",
          100: "#E0E3FF",
          200: "#C7CBFE",
          300: "#A5ABFC",
          400: "#7C82F8",
          500: "#3B3FE4",
          600: "#2A2DC8",
          700: "#1F21A6",
          800: "#1B1C84",
          900: "#16175F",
        },
        // Former dark "industrial" panels are now soft lavender glass surfaces.
        industrial: {
          950: "#EEF0FD",
          900: "#E8EAFB",
          850: "#E2E5F8",
          800: "#D8DCF3",
          700: "#C9CEEC",
          600: "#8A90AE",
          400: "#5D6482",
          300: "#4B5270",
          200: "#2E344D",
          100: "#F4F5FD",
          50: "#FAFAFF",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
        card: "0 4px 12px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
        elevation: "0 20px 25px -5px rgba(15, 23, 42, 0.06), 0 8px 10px -6px rgba(15, 23, 42, 0.03)",
        glow: "0 8px 24px -8px rgba(59, 63, 228, 0.45)",
        glass: "0 1px 2px rgba(16, 24, 64, 0.04), 0 12px 32px -12px rgba(31, 33, 166, 0.18)",
        "glass-hover": "0 2px 4px rgba(16, 24, 64, 0.06), 0 20px 40px -12px rgba(31, 33, 166, 0.28)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
