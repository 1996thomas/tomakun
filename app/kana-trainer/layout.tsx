import type { Metadata } from "next";
import { metadata as trainerMetadata } from "./metadata";

export const metadata: Metadata = trainerMetadata;

export default function KanaTrainerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
