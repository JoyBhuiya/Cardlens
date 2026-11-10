import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cardlens — your year on your credit card, explained", template: "%s · Cardlens" },
  description:
    "Upload a year of UK credit card statements and get one clear report: spend vs payments, where your money goes, and costed ways to save. No bank login needed.",
};

export const viewport: Viewport = {
  themeColor: "#0E7C66",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
