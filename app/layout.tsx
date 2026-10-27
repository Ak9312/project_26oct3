import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Self-hosted Geist (bundled with the app, no Google Fonts request).
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "BriefRadar · Turn a keyword into a content brief",
  description:
    "Search intent, a heading outline and the questions people actually ask Google, ready in seconds. Plus AI search visibility tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen font-sans text-[15px] leading-relaxed">{children}</body>
    </html>
  );
}
