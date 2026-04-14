import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BottomNav from "@/components/layout/BottomNav";
import Navbar from "@/components/layout/Navbar";
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
  description: "Plateforme modulaire d entrainement au japonais",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="app-shell min-h-full flex flex-col">
        <Navbar />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-20 pt-4 md:pb-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
