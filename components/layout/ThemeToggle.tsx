"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "tomakun.theme";
const THEME_EVENT = "tomakun:theme-sync";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

function persistTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.cookie = `tomakun.theme=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
      };
      const onThemeEvent = () => onStoreChange();
      const onMediaChange = () => {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved !== "light" && saved !== "dark") {
          onStoreChange();
        }
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(THEME_EVENT, onThemeEvent);
      media.addEventListener("change", onMediaChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(THEME_EVENT, onThemeEvent);
        media.removeEventListener("change", onMediaChange);
      };
    },
    () => {
      const savedTheme = window.localStorage.getItem(STORAGE_KEY);
      const resolvedTheme: ThemeMode =
        savedTheme === "dark" || savedTheme === "light" ? savedTheme : getSystemTheme();
      applyTheme(resolvedTheme);
      return resolvedTheme;
    },
    () => "light",
  );

  function toggleTheme(): void {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    persistTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
      aria-label={theme === "dark" ? "Activer le theme clair" : "Activer le theme sombre"}
      title={theme === "dark" ? "Theme clair" : "Theme sombre"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
