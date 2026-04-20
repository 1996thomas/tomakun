import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TOMAKUN",
    short_name: "TOMAKUN",
    description:
      "Japanese practice app for fast drills in hiragana, katakana, vocabulary and grammar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e3342f",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/logo-dark.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}

