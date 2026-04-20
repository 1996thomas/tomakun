import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BottomNav from "@/components/layout/BottomNav";
import Navbar from "@/components/layout/Navbar";
import RewardToaster from "@/components/feedback/RewardToaster";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

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
    default: "TOMAKUN – Japanese practice app",
    template: "%s | TOMAKUN",
  },
  description:
    "TOMAKUN is a Japanese practice app built for short, focused training sessions. Practice hiragana, katakana, vocabulary and grammar with quick quizzes and instant feedback.",
  keywords: [
    "Japanese practice app",
    "Japanese training app",
    "hiragana practice",
    "katakana practice",
    "Japanese vocabulary practice",
    "JLPT vocabulary drills",
    "Japanese grammar practice",
    "Japanese flashcards",
  ],
  metadataBase:
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL)
      : new URL("https://tomakun.fr"),
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "TOMAKUN – Japanese practice app",
    description:
      "Practice hiragana, katakana, JLPT vocabulary and grammar with fast quizzes, instant feedback and a mobile-first interface.",
    type: "website",
    locale: "en",
    siteName: "TOMAKUN",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "TOMAKUN - Japanese practice app",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "TOMAKUN – Japanese practice app",
    description:
      "A Japanese practice app focused on quick drills for kana, vocabulary and grammar – not another textbook.",
    images: ["/twitter-image"],
  },
  alternates: {
    canonical: "/",
    languages: {
      "en": "/",
      "fr": "/",
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    shortcut: ["/icon"],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

const clientPrefsBootstrap = `
(() => {
  try {
    const theme = window.localStorage.getItem("tomakun.theme");
    const locale = window.localStorage.getItem("tomakun.locale");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
    if (locale === "en" || locale === "fr") {
      document.documentElement.lang = locale;
    }
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="app-shell min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: clientPrefsBootstrap }} />
        <Navbar />
        <SpeedInsights />
        <Analytics />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-4">
          {children}
        </main>
        <RewardToaster />
        <BottomNav />
      </body>
    </html>
  );
}
