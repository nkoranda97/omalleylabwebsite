import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { LAB } from "@/lib/site/lab";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Headings on the public site.
 *
 * A serif. This site shares its structure with another lab's, and the display face is one of the
 * few things that makes the two read as two labs at a glance. Body text stays Geist Sans.
 *
 * Fraunces is a variable font, so no weight list: the one file covers the 600 and 700 used.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

/**
 * The root layout carries only what is genuinely global.
 *
 * Navigation belongs to the two nested layouts — `(public)/layout.tsx` and
 * `insiders/layout.tsx` — because the whole point is that the two sides of the site look
 * different. Keeping this as the single root layout is also what makes those two *nested*
 * rather than multiple root layouts: route groups can define several roots, and navigating
 * between two of them forces a full page reload.
 *
 * The title is the lab, not the database. Each section sets its own.
 */
export const metadata: Metadata = {
  title: LAB.name,
  description: `The ${LAB.name}: research, people, and publications.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
