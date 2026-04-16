"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";

const THEME_EVENT = "tomakun:theme-sync";
const STORAGE_KEY = "tomakun.theme";

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
  };
  const onThemeEvent = () => onStoreChange();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onThemeEvent);
  media.addEventListener("change", onMediaChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onThemeEvent);
    media.removeEventListener("change", onMediaChange);
  };
}

function getSnapshot(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const explicitTheme = document.documentElement.dataset.theme;
  if (explicitTheme === "dark") return "dark";
  if (explicitTheme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeLogo() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light");
  const src = theme === "dark" ? "/logo-dark.svg" : "/logo.svg";

  return <Image src={src} alt="Tomakun" width={148} height={36} className="h-9 w-auto" priority />;
}
