import type { Metadata } from "next";
import GrammarTrainer from "@/features/grammar-trainer/GrammarTrainer";

export const metadata: Metadata = {
  title: "Japanese grammar practice – Quick JLPT drills",
  description:
    "Practice Japanese grammar with short multiple-choice drills and instant feedback. Focus on JLPT-style patterns without long explanations.",
  openGraph: {
    title: "Japanese grammar practice – Quick JLPT drills",
    description:
      "Fast JLPT grammar practice for N5–N1 with quick questions, usage-based prompts and automatic next questions.",
    type: "article",
    url: "/grammar/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Japanese grammar practice - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Japanese grammar practice – Quick JLPT drills",
    description:
      "Fast JLPT grammar practice for N5–N1 with quick questions, usage-based prompts and automatic next questions.",
    images: ["/twitter-image"],
  },
  alternates: {
    canonical: "/grammar/",
    languages: {
      en: "/grammar/",
      fr: "/grammar/",
    },
  },
};

export default function GrammarPage() {
  return <GrammarTrainer />;
}
