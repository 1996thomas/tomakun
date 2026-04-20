import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background:
            "linear-gradient(140deg, #0f1115 0%, #1f2937 45%, #111827 100%)",
          color: "#ffffff",
          padding: "72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 88,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          TOMAKUN
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Japanese practice app
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 30,
            color: "#d1d5db",
          }}
        >
          Hiragana • Katakana • Vocabulary • Grammar
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
