import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BeltUpOverlay } from "@/components/ScoreHud";
import { SiteHeader } from "@/components/SiteHeader";
import { ToastProvider } from "@/components/Toasts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Fake Dojo",
    template: "%s | Fake Dojo",
  },
  description:
    "Train your eye for AI fakes. On your own photos. An AI agent forges one subtle edit, you hunt for it, and a forensic reveal shows exactly which pixels changed.",
};

export const viewport: Viewport = {
  themeColor: "#f6f4ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <ToastProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <BeltUpOverlay />
        </ToastProvider>
      </body>
    </html>
  );
}
