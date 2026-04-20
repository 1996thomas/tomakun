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
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Japanese grammar practice - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Japanese grammar practice – Quick JLPT drills",
    description:
      "Fast JLPT grammar practice for N5–N1 with quick questions, usage-based prompts and automatic next questions.",
    images: ["/android-chrome-512x512.png"],
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
