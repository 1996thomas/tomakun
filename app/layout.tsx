import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import BottomNav from "@/components/layout/BottomNav";
import Navbar from "@/components/layout/Navbar";
import { resolveLocale } from "@/lib/i18n.shared";
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
      : undefined,
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
  },
  twitter: {
    card: "summary",
    title: "TOMAKUN – Japanese practice app",
    description:
      "A Japanese practice app focused on quick drills for kana, vocabulary and grammar – not another textbook.",
  },
  alternates: {
    canonical: "/",
    languages: {
      "en": "/",
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("tomakun.theme")?.value;
  const localeCookie = cookieStore.get("tomakun.locale")?.value;
  const initialTheme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;
  const initialLocale = resolveLocale(localeCookie);

  return (
    <html
      lang={initialLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme={initialTheme}
    >
      <body className="app-shell min-h-full flex flex-col">
        <Navbar />
        <SpeedInsights />
        <Analytics />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
