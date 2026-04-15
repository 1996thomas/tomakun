"use client";

import { useSyncExternalStore } from "react";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";
import { isLocale, resolveLocale, type Locale } from "@/lib/i18n.shared";

const STORAGE_KEY = "tomakun.locale";
const COOKIE_KEY = "tomakun.locale";
const LOCALE_EVENT = "tomakun:locale-sync";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = {
  en,
  fr,
};

function applyLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

function persistLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

function getInitialBrowserLocale(): Locale {
  if (typeof document !== "undefined" && isLocale(document.documentElement.lang)) {
    return document.documentElement.lang;
  }
  if (typeof navigator !== "undefined") {
    const language = navigator.language.toLowerCase();
    if (language.startsWith("fr")) return "fr";
  }
  return "en";
}

function getLocaleSnapshot(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  const locale = resolveLocale(saved ?? getInitialBrowserLocale());
  applyLocale(locale);
  return locale;
}

export function setLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  applyLocale(locale);
  window.localStorage.setItem(STORAGE_KEY, locale);
  persistLocale(locale);
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function useI18n() {
  const locale: Locale = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
      };
      const onLocale = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(LOCALE_EVENT, onLocale);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(LOCALE_EVENT, onLocale);
      };
    },
    getLocaleSnapshot,
    () => "en",
  );

  function t(key: string, vars?: Record<string, string | number>): string {
    const base = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
    return format(base, vars);
  }

  return {
    locale,
    setLocale,
    t,
  };
}

