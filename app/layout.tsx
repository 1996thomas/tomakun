import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import BottomNav from "@/components/layout/BottomNav";
import Navbar from "@/components/layout/Navbar";
import { resolveLocale } from "@/lib/i18n.shared";
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
  title: "TOMAKUN",
  description: "Modular Japanese training platform",
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
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
