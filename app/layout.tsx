import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BriefRadar — SEO briefs and AI search tracking",
  description: "Keyword in, content brief out. Plus a weekly check of whether your brand appears in AI answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <header className="header">
          <div className="header-inner">
            <a href="/" className="logo">
              <span className="logo-mark" aria-hidden="true">br</span>
              BriefRadar
            </a>
            <Nav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
