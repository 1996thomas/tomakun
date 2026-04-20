import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function TwitterImage() {
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
            "radial-gradient(circle at top left, #1f2937 0%, #0f1115 55%, #020617 100%)",
          color: "#ffffff",
          padding: "72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 86,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          TOMAKUN
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Quick Japanese drills
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            color: "#cbd5e1",
          }}
        >
          Kana, vocab and grammar practice.
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
